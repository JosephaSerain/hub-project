import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';

const IdSchema = z.uuid();

export const handler = async (event: APIGatewayProxyEventV2) => {
    // 1. Valider l'id reçu dans l'URL
    const id = IdSchema.safeParse(event.pathParameters?.id);
    if (!id.success) {
        return json(400, { error: "L'identifiant doit être un UUID" });
    }

    // 2. Lire par la clé : un GetItem, la lecture la plus efficace de DynamoDB
    const resultat = await db.send(
        new GetCommand({ TableName: TABLE_NAME, Key: { id: id.data } }),
    );

    // 3. Pas trouvé → 404
    if (!resultat.Item) {
        return json(404, { error: 'Service introuvable' });
    }
    return json(200, resultat.Item);
};