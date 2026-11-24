import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { cles, sansCles } from '../../lib/keys'

// Un identifiant lisible : minuscules, chiffres et tirets (ex. "catalogue", "api-paiement")
const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);

const CreateServiceSchema = z.object({
    nom: Slug,
    equipe: Slug,
    description: z.string().max(500).optional(),
    statut: z.enum(['developpement', 'production', 'deprecie']).default('developpement'),
});

export const handler = async (event: APIGatewayProxyEventV2) => {
    let body: unknown;
    try {
        body = JSON.parse(event.body ?? '{}');
    } catch {
        return json(400, { error: 'Le body doit être du JSON valide' });
    }

    const resultat = CreateServiceSchema.safeParse(body);
    if (!resultat.success) {
        return json(400, { error: 'Données invalides', details: resultat.error.issues });
    }

    const { nom, equipe, description, statut } = resultat.data;
    const creeLe = new Date().toISOString();

    const item = {
        ...cles.service(nom),
        ...cles.serviceParEquipe(equipe, nom),
        ...cles.serviceParStatut(statut, creeLe, nom),
        type: 'SERVICE',
        id: nom,
        nom,
        equipe,
        description,
        statut,
        creeLe,
    };

    try {
        await db.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: item,
                // L'écriture échoue si un élément avec cette clé existe déjà : pas d'écrasement
                ConditionExpression: 'attribute_not_exists(PK)',
            }),
        );
    } catch (erreur) {
        if (erreur instanceof ConditionalCheckFailedException) {
            return json(409, { error: `Un service nommé "${nom}" existe déjà` });
        }
        throw erreur;
    }

    return json(201, sansCles(item));
};