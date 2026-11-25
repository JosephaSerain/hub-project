import { randomUUID } from 'node:crypto';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { cles, sansCles } from '../../lib/keys';

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
const DeploiementSchema = z.object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),   // une version SemVer : 1.4.0
    deployePar: Slug,
});

export const handler = async (event: APIGatewayProxyEventV2) => {
    const serviceId = Slug.safeParse(event.pathParameters?.id);
    if (!serviceId.success) {
        return json(400, { error: 'Identifiant de service invalide' });
    }

    let body: unknown;
    try {
        body = JSON.parse(event.body ?? '{}');
    } catch {
        return json(400, { error: 'Le body doit être du JSON valide' });
    }
    const donnees = DeploiementSchema.safeParse(body);
    if (!donnees.success) {
        return json(400, { error: 'Données invalides', details: donnees.error.issues });
    }

    const deployeLe = new Date().toISOString();
    const deploiementId = randomUUID().slice(0, 8);
    const deploiement = {
        ...cles.deploiement(serviceId.data, deployeLe, deploiementId),
        type: 'DEPLOIEMENT',
        id: deploiementId,
        service: serviceId.data,
        ...donnees.data,
        deployeLe,
    };

    try {
        await db.send(
            new TransactWriteCommand({
                TransactItems: [
                    // 1. Enregistrer le déploiement
                    {
                        Put: {
                            TableName: TABLE_NAME,
                            Item: deploiement,
                            ConditionExpression: 'attribute_not_exists(PK)',
                        },
                    },
                    // 2. Mettre à jour le service… seulement s'il existe
                    {
                        Update: {
                            TableName: TABLE_NAME,
                            Key: cles.service(serviceId.data),
                            UpdateExpression: 'SET versionCourante = :version, dernierDeploiementLe = :date',
                            ConditionExpression: 'attribute_exists(PK)',
                            ExpressionAttributeValues: {
                                ':version': donnees.data.version,
                                ':date': deployeLe,
                            },
                        },
                    },
                ],
            }),
        );
    } catch (erreur) {
        // La transaction a été annulée : AUCUNE des deux écritures n'a eu lieu.
        // CancellationReasons dit quelle opération a échoué (index 1 = la mise à jour du service).
        if (
            erreur instanceof TransactionCanceledException &&
            erreur.CancellationReasons?.[1]?.Code === 'ConditionalCheckFailed'
        ) {
            return json(404, { error: 'Service introuvable' });
        }
        throw erreur;
    }

    return json(201, sansCles(deploiement));
};