import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// Code hors du handler : exécuté une seule fois, au cold start
const demarrage = new Date().toISOString();

export const handler = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
    return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            message: 'Bonjour depuis DevHub 👋',
            chemin: event.rawPath,
            environnementDemarreA: demarrage,
            requeteA: new Date().toISOString(),
        }),
    };
};