import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { sansCles } from '../../lib/keys';
import { creerCurseur, lireCurseur } from '../../lib/pagination';

const Statut = z.enum(['developpement', 'production', 'deprecie']);

export const handler = async (event: APIGatewayProxyEventV2) => {
    const statut = Statut.safeParse(event.pathParameters?.statut);
    if (!statut.success) {
        return json(400, { error: 'Statut invalide' });
    }

    const resultat = await db.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2PK = :statut',
            ExpressionAttributeValues: { ':statut': `STATUS#${statut.data}` },
            ScanIndexForward: false,   // les changements de statut les plus récents d'abord
            Limit: 20,
            ExclusiveStartKey: lireCurseur(event.queryStringParameters?.curseur),
        }),
    );

    return json(200, {
        services: (resultat.Items ?? []).map(sansCles),
        curseur: creerCurseur(resultat.LastEvaluatedKey),
    });
};