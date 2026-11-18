import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Créé une seule fois par environnement (hors du handler), puis réutilisé
export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const TABLE_NAME = process.env.TABLE_NAME!;