import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler as creerService } from '../src/handlers/services/create';
import { handler as lireService } from '../src/handlers/services/get';
import { handler as listerServicesEquipe } from '../src/handlers/teams/list-services';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { handler as creerDeploiement } from '../src/handlers/deployments/create';
import { handler as listerDeploiements } from '../src/handlers/deployments/list';

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const evenement = (partiel: Partial<APIGatewayProxyEventV2>) => partiel as APIGatewayProxyEventV2;
const reponse = (res: unknown) => res as APIGatewayProxyStructuredResultV2;

describe('POST /services', () => {
    const body = JSON.stringify({ nom: 'catalogue', equipe: 'plateforme' });

    it('crée le service avec ses clés et une écriture conditionnelle', async () => {
        ddbMock.on(PutCommand).resolves({});

        const res = reponse(await creerService(evenement({ body })));

        expect(res.statusCode).toBe(201);
        const input = ddbMock.commandCalls(PutCommand)[0].args[0].input;
        expect(input.Item).toMatchObject({
            PK: 'SERVICE#catalogue',
            SK: 'METADATA',
            GSI1PK: 'TEAM#plateforme',
            GSI1SK: 'SERVICE#catalogue',
            statut: 'developpement',
        });
        expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
    });

    it("ne renvoie pas les clés techniques au client", async () => {
        ddbMock.on(PutCommand).resolves({});

        const corps = JSON.parse(reponse(await creerService(evenement({ body }))).body!);

        expect(corps).not.toHaveProperty('PK');
        expect(corps).not.toHaveProperty('GSI1PK');
    });

    it('renvoie 409 si le service existe déjà', async () => {
        ddbMock.on(PutCommand).rejects(
            new ConditionalCheckFailedException({ message: 'existe', $metadata: {} }),
        );

        const res = reponse(await creerService(evenement({ body })));

        expect(res.statusCode).toBe(409);
    });

    it('renvoie 400 si le nom contient des caractères interdits, sans écrire', async () => {
        const res = reponse(
            await creerService(evenement({ body: JSON.stringify({ nom: 'Mon Service!', equipe: 'plateforme' }) })),
        );

        expect(res.statusCode).toBe(400);
        expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
    });
});

describe('GET /services/{id}', () => {
    it('lit le service par sa clé complète', async () => {
        ddbMock.on(GetCommand).resolves({ Item: { PK: 'SERVICE#catalogue', SK: 'METADATA', nom: 'catalogue' } });

        const res = reponse(await lireService(evenement({ pathParameters: { id: 'catalogue' } })));

        expect(res.statusCode).toBe(200);
        expect(ddbMock.commandCalls(GetCommand)[0].args[0].input.Key).toEqual({
            PK: 'SERVICE#catalogue',
            SK: 'METADATA',
        });
        expect(JSON.parse(res.body!)).toEqual({ nom: 'catalogue' });
    });

    it("renvoie 404 quand le service n'existe pas", async () => {
        ddbMock.on(GetCommand).resolves({});

        const res = reponse(await lireService(evenement({ pathParameters: { id: 'inconnu' } })));

        expect(res.statusCode).toBe(404);
    });
});

describe('GET /teams/{equipe}/services', () => {
    it("fait une Query sur GSI1 pour l'équipe", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [{ nom: 'catalogue', GSI1PK: 'TEAM#plateforme' }] });

        const res = reponse(await listerServicesEquipe(evenement({ pathParameters: { equipe: 'plateforme' } })));

        expect(res.statusCode).toBe(200);
        const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
        expect(input.IndexName).toBe('GSI1');
        expect(input.ExpressionAttributeValues).toMatchObject({ ':equipe': 'TEAM#plateforme' });
        expect(JSON.parse(res.body!)).toEqual({ services: [{ nom: 'catalogue' }], curseur: null });
    });

    it("renvoie un curseur quand il reste des résultats", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: { PK: 'x', SK: 'y' } });

        const res = reponse(await listerServicesEquipe(evenement({ pathParameters: { equipe: 'plateforme' } })));

        expect(JSON.parse(res.body!).curseur).toEqual(expect.any(String));
    });
});

describe('POST /services/{id}/deployments', () => {
    const body = JSON.stringify({ version: '1.2.0', deployePar: 'josepha' });

    it("écrit le déploiement et met à jour le service dans une même transaction", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});

        const res = reponse(await creerDeploiement(evenement({ pathParameters: { id: 'catalogue' }, body })));

        expect(res.statusCode).toBe(201);
        const [ajout, miseAJour] = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
        expect(ajout.Put!.Item).toMatchObject({ PK: 'SERVICE#catalogue', version: '1.2.0' });
        expect(ajout.Put!.Item!.SK).toMatch(/^DEPLOY#/);
        expect(miseAJour.Update!.Key).toEqual({ PK: 'SERVICE#catalogue', SK: 'METADATA' });
        expect(miseAJour.Update!.ConditionExpression).toBe('attribute_exists(PK)');
    });

    it("renvoie 404 quand la transaction est annulée parce que le service n'existe pas", async () => {
        ddbMock.on(TransactWriteCommand).rejects(
            new TransactionCanceledException({
                message: 'annulée',
                $metadata: {},
                CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
            }),
        );

        const res = reponse(await creerDeploiement(evenement({ pathParameters: { id: 'fantome' }, body })));

        expect(res.statusCode).toBe(404);
    });

    it("renvoie 400 si la version n'est pas au format SemVer, sans écrire", async () => {
        const res = reponse(
            await creerDeploiement(
                evenement({ pathParameters: { id: 'catalogue' }, body: JSON.stringify({ version: 'v2', deployePar: 'josepha' }) }),
            ),
        );

        expect(res.statusCode).toBe(400);
        expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    });
});

describe('GET /services/{id}/deployments', () => {
    it('lit les déploiements du plus récent au plus ancien, 10 par défaut', async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });

        await listerDeploiements(evenement({ pathParameters: { id: 'catalogue' } }));

        const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
        expect(input.ScanIndexForward).toBe(false);
        expect(input.Limit).toBe(10);
        expect(input.ExpressionAttributeValues).toMatchObject({ ':prefixe': 'DEPLOY#' });
    });

    it('refuse une limite trop grande', async () => {
        const res = reponse(
            await listerDeploiements(
                evenement({ pathParameters: { id: 'catalogue' }, queryStringParameters: { limite: '1000' } }),
            ),
        );

        expect(res.statusCode).toBe(400);
    });
});