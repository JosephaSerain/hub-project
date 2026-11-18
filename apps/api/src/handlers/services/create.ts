import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';

const CreateServiceSchema = z.object({
    nom: z.string().min(2).max(60),
    equipe: z.string().min(2).max(40),
    description: z.string().max(500).optional(),
});

export const handler = async (event: APIGatewayProxyEventV2) => {
    // 1. Lire le body (il peut être absent ou ne pas être du JSON)
    let body: unknown;
    try {
        body = JSON.parse(event.body ?? '{}');
    } catch {
        return json(400, { error: 'Le body doit être du JSON valide' });
    }

    // 2. Valider avec Zod
    const resultat = CreateServiceSchema.safeParse(body);
    if (!resultat.success) {
        return json(400, { error: 'Données invalides', details: resultat.error.issues });
    }

    // 3. Enregistrer (l'id et la date sont générés par le serveur, jamais par le client)
    const service = {
        id: randomUUID(),
        ...resultat.data,
        creeLe: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: TABLE_NAME, Item: service }));

    return json(201, service);
};