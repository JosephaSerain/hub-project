import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';
import { cles, sansCles } from '../../lib/keys';

const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const handler = async (event: APIGatewayProxyEventV2) => {
    const id = Slug.safeParse(event.pathParameters?.id);
    if (!id.success) {
        return json(400, { error: 'Identifiant de service invalide' });
    }

    const resultat = await db.send(
        new GetCommand({ TableName: TABLE_NAME, Key: cles.service(id.data) }),
    );

    if (!resultat.Item) {
        return json(404, { error: 'Service introuvable' });
    }
    return json(200, sansCles(resultat.Item));
};