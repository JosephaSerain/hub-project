// Remplit la table avec 50 services et 1 000 déploiements de test (ou les supprime avec --supprimer)
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.TABLE_NAME;
if (!TABLE) throw new Error('Variable TABLE_NAME manquante');
const supprimer = process.argv.includes('--supprimer');

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const EQUIPES = ['plateforme', 'ecommerce', 'paiement', 'data', 'mobile'];
const STATUTS = ['developpement', 'production', 'deprecie'];
const remplissage = 'x'.repeat(500); // grossit les éléments pour rendre les coûts visibles

const elements = [];
for (let s = 0; s < 50; s++) {
    const id = `seed-${String(s).padStart(3, '0')}`;
    const equipe = EQUIPES[s % EQUIPES.length];
    const statut = STATUTS[s % STATUTS.length];
    const date = new Date(Date.UTC(2026, 0, 1 + s)).toISOString();

    elements.push({
        PK: `SERVICE#${id}`, SK: 'METADATA',
        GSI1PK: `TEAM#${equipe}`, GSI1SK: `SERVICE#${id}`,
        GSI2PK: `STATUS#${statut}`, GSI2SK: `${date}#SERVICE#${id}`,
        type: 'SERVICE', id, nom: id, equipe, statut, description: remplissage,
        revision: 1, creeLe: date, modifieLe: date,
    });

    for (let d = 0; d < 20; d++) {
        const deployeLe = new Date(Date.UTC(2026, 1, 1 + d)).toISOString();
        const depId = `${id}-${d}`;
        elements.push({
            PK: `SERVICE#${id}`, SK: `DEPLOY#${deployeLe}#${depId}`,
            type: 'DEPLOIEMENT', id: depId, service: id, version: `1.${d}.0`,
            deployePar: 'seed', deployeLe, notes: remplissage,
        });
    }
}

// BatchWrite : 25 éléments maximum par appel, et DynamoDB peut en renvoyer certains « non traités »
for (let i = 0; i < elements.length; i += 25) {
    let requetes = elements.slice(i, i + 25).map((e) =>
        supprimer ? { DeleteRequest: { Key: { PK: e.PK, SK: e.SK } } } : { PutRequest: { Item: e } },
    );
    while (requetes.length > 0) {
        const res = await db.send(new BatchWriteCommand({ RequestItems: { [TABLE]: requetes } }));
        requetes = res.UnprocessedItems?.[TABLE] ?? [];
        if (requetes.length > 0) await new Promise((r) => setTimeout(r, 200)); // on patiente avant de réessayer
    }
}

console.log(`${elements.length} éléments ${supprimer ? 'supprimés' : 'écrits'} dans ${TABLE}`);