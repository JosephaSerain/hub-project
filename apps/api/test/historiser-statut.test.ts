import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { handler } from '../src/handlers/streams/historiser-statut'

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const service = {
    PK: 'SERVICE#panier', SK: 'METADATA', type: 'SERVICE', id: 'panier',
    statut: 'production', revision: 3, modifieLe: '2026-11-25T10:00:00.000Z',
};

const enregistrement = (avant: object, apres: object, sequence = '1') =>
    ({
        eventName: 'MODIFY',
        dynamodb: { SequenceNumber: sequence, OldImage: marshall(avant), NewImage: marshall(apres) },
    }) as unknown as DynamoDBRecord;

const evenement = (...records: DynamoDBRecord[]): DynamoDBStreamEvent => ({ Records: records });

describe('Historisation des statuts (stream)', () => {
    const changement = { ...service, statut: 'deprecie', revision: 4, modifieLe: '2026-11-25T12:00:00.000Z' };

    it('écrit une entrée d’historique idempotente avec un TTL en secondes', async () => {
        ddbMock.on(PutCommand).resolves({});

        const res = await handler(evenement(enregistrement(service, changement)));

        expect(res.batchItemFailures).toEqual([]);
        const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
        expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
        expect(input.Item).toMatchObject({
            PK: 'SERVICE#panier',
            SK: 'HISTO#000004',
            ancienStatut: 'production',
            nouveauStatut: 'deprecie',
            expireLe: Date.parse('2026-11-25T12:00:00.000Z') / 1000 + 90 * 24 * 60 * 60,
        });
    });

    it('ignore une modification sans changement de statut (déploiement)', async () => {
        await handler(evenement(enregistrement(service, { ...service, versionCourante: '1.3.0' })));

        expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
    });

    it('considère un doublon comme un succès', async () => {
        ddbMock.on(PutCommand).rejects(new ConditionalCheckFailedException({ message: 'doublon', $metadata: {} }));

        const res = await handler(evenement(enregistrement(service, changement)));

        expect(res.batchItemFailures).toEqual([]);
    });

    it('signale uniquement l’enregistrement en échec', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        ddbMock.on(PutCommand).rejects(new Error('ProvisionedThroughputExceeded'));

        const res = await handler(evenement(enregistrement(service, changement, '42')));

        expect(res.batchItemFailures).toEqual([{ itemIdentifier: '42' }]);
        expect(consoleError).toHaveBeenCalledWith('Échec de l’historisation', expect.objectContaining({ sequence: '42' }));
        consoleError.mockRestore();
    });
});