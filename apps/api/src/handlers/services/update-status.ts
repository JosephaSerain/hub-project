import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { cles, sansCles } from '../../lib/keys';

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
const ChangementStatut = z.object({
    statut: z.enum(['developpement', 'production', 'deprecie']),
    revision: z.number().int().positive(),   // la révision que le client a lue
});

export const handler = async (event: APIGatewayProxyEventV2) => {
    const id = Slug.safeParse(event.pathParameters?.id);
    if (!id.success) {
        return json(400, { error: 'Identifiant de service invalide' });
    }

    let body: unknown;
    try {
        body = JSON.parse(event.body ?? '{}');
    } catch {
        return json(400, { error: 'Le body doit être du JSON valide' });
    }
    const donnees = ChangementStatut.safeParse(body);
    if (!donnees.success) {
        return json(400, { error: 'Données invalides', details: donnees.error.issues });
    }

    const { statut, revision } = donnees.data;
    const maintenant = new Date().toISOString();
    const { GSI2PK, GSI2SK } = cles.serviceParStatut(statut, maintenant, id.data);

    try {
        const resultat = await db.send(
            new UpdateCommand({
                TableName: TABLE_NAME,
                Key: cles.service(id.data),
                // On change le statut ET les clés de GSI2, pour que l'index range le service au bon endroit
                UpdateExpression:
                    'SET statut = :statut, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk, modifieLe = :date, revision = revision + :un',
                // Le verrouillage optimiste : seulement si personne n'a modifié le service depuis la lecture
                ConditionExpression: 'revision = :revisionLue',
                ExpressionAttributeValues: {
                    ':statut': statut,
                    ':gsi2pk': GSI2PK,
                    ':gsi2sk': GSI2SK,
                    ':date': maintenant,
                    ':un': 1,
                    ':revisionLue': revision,
                },
                ReturnValues: 'ALL_NEW',                          // renvoie l'élément après modification
                ReturnValuesOnConditionCheckFailure: 'ALL_OLD',   // en cas d'échec, renvoie l'élément actuel
            }),
        );
        return json(200, sansCles(resultat.Attributes ?? {}));
    } catch (erreur) {
        if (erreur instanceof ConditionalCheckFailedException) {
            // Pas d'élément actuel → le service n'existe pas
            if (!erreur.Item) {
                return json(404, { error: 'Service introuvable' });
            }
            // Sinon, quelqu'un l'a modifié entre-temps : conflit
            const actuel = unmarshall(erreur.Item);
            return json(409, {
                error: 'Le service a été modifié entre-temps. Relisez-le avant de réessayer.',
                revisionActuelle: actuel.revision,
            });
        }
        throw erreur;
    }
};