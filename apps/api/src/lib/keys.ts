// Toutes les clés DynamoDB sont construites ici, et nulle part ailleurs.
// Si le modèle change, on ne modifie qu'un seul fichier.

export const cles = {
    service: (id: string) => ({ PK: `SERVICE#${id}`, SK: 'METADATA' }),
    deploiement: (serviceId: string, date: string, deploiementId: string) => ({
        PK: `SERVICE#${serviceId}`,
        SK: `DEPLOY#${date}#${deploiementId}`,
    }),

    serviceParEquipe: (equipe: string, id: string) => ({
        GSI1PK: `TEAM#${equipe}`,
        GSI1SK: `SERVICE#${id}`,
    }),

    serviceParStatut: (statut: string, date: string, id: string) => ({
        GSI2PK: `STATUS#${statut}`,
        GSI2SK: `${date}#SERVICE#${id}`,
    }),
    historiqueStatut: (serviceId: string, revision: number) => ({
        PK: `SERVICE#${serviceId}`,
        SK: `HISTO#${String(revision).padStart(6, '0')}`,
    }),
};

// Retire les attributs techniques avant de renvoyer un élément au client
const CLES_TECHNIQUES = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'];

export const sansCles = (item: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(item).filter(([cle]) => !CLES_TECHNIQUES.includes(cle)));