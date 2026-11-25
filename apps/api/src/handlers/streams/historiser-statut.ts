import type { DynamoDBBatchResponse, DynamoDBStreamEvent } from 'aws-lambda';
import { ConditionalCheckFailedException, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { db, TABLE_NAME } from '../../lib/db';
import { cles } from '../../lib/keys';

const DUREE_DE_VIE_SECONDES = 90 * 24 * 60 * 60;

// Les types d'aws-lambda et ceux du SDK décrivent le même format brut, mais TypeScript ne le sait pas
const lire = (image: unknown) => unmarshall((image ?? {}) as Record<string, AttributeValue>);

export const handler = async (event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> => {
    const batchItemFailures: DynamoDBBatchResponse['batchItemFailures'] = [];

    for (const record of event.Records) {
        const avant = lire(record.dynamodb?.OldImage);
        const apres = lire(record.dynamodb?.NewImage);

        // Déploiement ou autre modification : le statut n'a pas changé
        if (!avant.statut || avant.statut === apres.statut) continue;

        try {
            await db.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        ...cles.historiqueStatut(apres.id, apres.revision),
                        type: 'HISTORIQUE_STATUT',
                        serviceId: apres.id,
                        ancienStatut: avant.statut,
                        nouveauStatut: apres.statut,
                        revision: apres.revision,
                        changeLe: apres.modifieLe,
                        // Calculé depuis la date du changement (pas Date.now()) : un rejeu produit exactement le même élément
                        expireLe: Math.floor(Date.parse(apres.modifieLe) / 1000) + DUREE_DE_VIE_SECONDES,
                    },
                    ConditionExpression: 'attribute_not_exists(PK)',
                }),
            );
        } catch (erreur) {
            if (erreur instanceof ConditionalCheckFailedException) continue; // déjà historisé : doublon ignoré
            console.error('Échec de l’historisation', { sequence: record.dynamodb?.SequenceNumber, erreur });
            batchItemFailures.push({ itemIdentifier: record.dynamodb!.SequenceNumber! });
        }
    }

    return { batchItemFailures };
};