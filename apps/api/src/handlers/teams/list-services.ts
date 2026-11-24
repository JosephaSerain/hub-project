import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { sansCles } from '../../lib/keys';

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const handler = async (event: APIGatewayProxyEventV2) => {
    const equipe = Slug.safeParse(event.pathParameters?.equipe);
    if (!equipe.success) {
        return json(400, { error: "Identifiant d'équipe invalide" });
    }

    // Pagination : le client renvoie le curseur reçu dans la réponse précédente
    const curseur = event.queryStringParameters?.curseur;
    const debut = curseur ? JSON.parse(Buffer.from(curseur, 'base64url').toString()) : undefined;

    const resultat = await db.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :equipe AND begins_with(GSI1SK, :prefixe)',
            ExpressionAttributeValues: { ':equipe': `TEAM#${equipe.data}`, ':prefixe': 'SERVICE#' },
            Limit: 20,
            ExclusiveStartKey: debut,
        }),
    );

    return json(200, {
        services: (resultat.Items ?? []).map(sansCles),
        // S'il reste des résultats, DynamoDB renvoie LastEvaluatedKey : on en fait un curseur
        curseur: resultat.LastEvaluatedKey
            ? Buffer.from(JSON.stringify(resultat.LastEvaluatedKey)).toString('base64url')
            : null,
    });
};