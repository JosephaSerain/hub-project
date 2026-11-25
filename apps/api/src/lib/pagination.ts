export const lireCurseur = (curseur?: string) =>
    curseur ? JSON.parse(Buffer.from(curseur, 'base64url').toString()) : undefined;

export const creerCurseur = (cle?: Record<string, unknown>) =>
    cle ? Buffer.from(JSON.stringify(cle)).toString('base64url') : null;