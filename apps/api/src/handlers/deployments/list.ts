import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { sansCles } from '../../lib/keys';
import { lireCurseur, creerCurseur } from '../../lib/pagination';

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
const Limite = z.coerce.number().int().min(1).max(50).default(10);

export const handler = async (event: APIGatewayProxyEventV2) => {
    const serviceId = Slug.safeParse(event.pathParameters?.id);
    const limite = Limite.safeParse(event.queryStringParameters?.limite);
    if (!serviceId.success || !limite.success) {
        return json(400, { error: 'Paramètres invalides' });
    }

    const resultat = await db.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :service AND begins_with(SK, :prefixe)',
            ExpressionAttributeValues: {
                ':service': `SERVICE#${serviceId.data}`,
                ':prefixe': 'DEPLOY#',
            },
            ScanIndexForward: false,      // ordre décroissant : du plus récent au plus ancien
            Limit: limite.data,
            ExclusiveStartKey: lireCurseur(event.queryStringParameters?.curseur),
        }),
    );

    return json(200, {
        deploiements: (resultat.Items ?? []).map(sansCles),
        curseur: creerCurseur(resultat.LastEvaluatedKey),
    });
};