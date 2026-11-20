import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler as creerService } from '../src/handlers/services/create';
import { handler as lireService } from '../src/handlers/services/get';

// Remplace TOUS les clients DynamoDBDocumentClient (y compris celui de db.ts) par un faux
const ddbMock = mockClient(DynamoDBDocumentClient);

// Chaque test repart d'un mock vierge : les tests restent indépendants
beforeEach(() => ddbMock.reset());

// Petits utilitaires pour construire un événement et lire la réponse
const evenement = (partiel: Partial<APIGatewayProxyEventV2>) => partiel as APIGatewayProxyEventV2;
const reponse = (res: unknown) => res as APIGatewayProxyStructuredResultV2;

describe('POST /services', () => {
    it('crée un service et renvoie 201', async () => {
        // Arrange
        ddbMock.on(PutCommand).resolves({});

        // Act
        const res = reponse(
            await creerService(evenement({ body: JSON.stringify({ nom: 'catalogue', equipe: 'plateforme' }) })),
        );

        // Assert
        expect(res.statusCode).toBe(201);
        const corps = JSON.parse(res.body!);
        expect(corps).toMatchObject({ nom: 'catalogue', equipe: 'plateforme' });
        expect(corps.id).toEqual(expect.any(String));

        const appels = ddbMock.commandCalls(PutCommand);
        expect(appels).toHaveLength(1);
        expect(appels[0].args[0].input.TableName).toBe('table-de-test');
    });

    it("renvoie 400 si les données sont invalides, sans écrire en base", async () => {
        const res = reponse(await creerService(evenement({ body: JSON.stringify({ nom: 'x' }) })));

        expect(res.statusCode).toBe(400);
        expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
    });

    it("renvoie 400 si le body n'est pas du JSON", async () => {
        const res = reponse(await creerService(evenement({ body: 'pas du json' })));

        expect(res.statusCode).toBe(400);
    });
});

describe('GET /services/{id}', () => {
    const id = 'a1a3b04a-e4d5-432b-b0aa-0611d1aeb58c';

    it('renvoie 200 et le service quand il existe', async () => {
        ddbMock.on(GetCommand).resolves({ Item: { id, nom: 'catalogue', equipe: 'plateforme' } });

        const res = reponse(await lireService(evenement({ pathParameters: { id } })));

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body!)).toMatchObject({ id, nom: 'catalogue' });
    });

    it("renvoie 404 quand le service n'existe pas", async () => {
        ddbMock.on(GetCommand).resolves({});   // DynamoDB ne renvoie pas d'Item

        const res = reponse(await lireService(evenement({ pathParameters: { id } })));

        expect(res.statusCode).toBe(404);
    });

    it("renvoie 400 si l'id n'est pas un UUID, sans interroger la base", async () => {
        const res = reponse(await lireService(evenement({ pathParameters: { id: 'abc' } })));

        expect(res.statusCode).toBe(400);
        expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
    });
});