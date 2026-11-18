import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLE_NAME } from '../../lib/db';
import { json } from '../../lib/http';

export const handler = async () => {
    // ⚠️ Scan temporaire : acceptable sur une toute petite table d'apprentissage.
    const resultat = await db.send(new ScanCommand({ TableName: TABLE_NAME, Limit: 50 }));
    return json(200, resultat.Items ?? []);
};