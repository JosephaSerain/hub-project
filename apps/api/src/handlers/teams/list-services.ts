import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { sansCles } from '../../lib/keys';
import { creerCurseur, lireCurseur } from '../../lib/pagination';

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const handler = async (event: APIGatewayProxyEventV2) => {
    const equipe = Slug.safeParse(event.pathParameters?.equipe);
    if (!equipe.success) {
        return json(400, { error: "Identifiant d'équipe invalide" });
    }

    const resultat = await db.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :equipe AND begins_with(GSI1SK, :prefixe)',
            ExpressionAttributeValues: { ':equipe': `TEAM#${equipe.data}`, ':prefixe': 'SERVICE#' },
            Limit: 20,
            // 1. On LIT le curseur envoyé par le client (s'il y en a un)
            ExclusiveStartKey: lireCurseur(event.queryStringParameters?.curseur),
        }),
    );

    return json(200, {
        services: (resultat.Items ?? []).map(sansCles),
        // 2. On CRÉE le curseur à renvoyer au client (null s'il n'y a plus de résultats)
        curseur: creerCurseur(resultat.LastEvaluatedKey),
    });
};