import type { PasswordResetToken, Prisma } from "@prisma/client";
import { prisma } from "@/config/database";

/** Client Prisma ou transaction en cours — pour les écritures groupées. */
type Client = Prisma.TransactionClient | typeof prisma;

export function creer(
  data: { utilisateurId: number; codeHash: string; expiresAt: Date },
  client: Client = prisma,
): Promise<PasswordResetToken> {
  return client.passwordResetToken.create({ data });
}

/**
 * Supprime les codes encore inutilisés d'un compte. Appelée à chaque nouvelle
 * demande — seul le dernier code envoyé doit fonctionner — et après une
 * réinitialisation réussie.
 */
export function supprimerNonUtilises(
  utilisateurId: number,
  client: Client = prisma,
): Promise<Prisma.BatchPayload> {
  return client.passwordResetToken.deleteMany({ where: { utilisateurId, utiliseA: null } });
}

/**
 * Le code encore valable d'un compte : non utilisé, non expiré, et sous le
 * plafond d'essais. Au plus un, les précédents étant supprimés à chaque
 * nouvelle demande ; `orderBy` garantit malgré tout le plus récent.
 */
export function trouverValide(
  utilisateurId: number,
  maintenant: Date,
  tentativesMax: number,
): Promise<PasswordResetToken | null> {
  return prisma.passwordResetToken.findFirst({
    where: {
      utilisateurId,
      utiliseA: null,
      expiresAt: { gt: maintenant },
      tentatives: { lt: tentativesMax },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function trouverParId(id: string): Promise<PasswordResetToken | null> {
  return prisma.passwordResetToken.findUnique({ where: { id } });
}

/**
 * Réserve un essai AVANT de comparer le code, en une seule écriture
 * conditionnelle : l'incrément n'a lieu que si le plafond n'est pas atteint.
 * Renvoie `false` quand plus aucun essai n'est disponible.
 *
 * L'ordre inverse — comparer, puis incrémenter en cas d'échec — laisserait
 * passer des essais supplémentaires : deux requêtes simultanées liraient
 * toutes deux « 4 essais », compareraient chacune, et la sixième tentative
 * aurait bel et bien eu lieu.
 */
export async function reserverTentative(id: string, tentativesMax: number): Promise<boolean> {
  const resultat = await prisma.passwordResetToken.updateMany({
    where: { id, tentatives: { lt: tentativesMax } },
    data: { tentatives: { increment: 1 } },
  });
  return resultat.count === 1;
}

/**
 * Marque le code comme consommé, seulement s'il ne l'est pas déjà. Renvoie le
 * nombre de lignes touchées : 0 signifie qu'une autre requête l'a consommé
 * entre-temps, et que cette réinitialisation doit être refusée.
 */
export async function marquerUtilise(
  id: string,
  maintenant: Date,
  client: Client = prisma,
): Promise<number> {
  const resultat = await client.passwordResetToken.updateMany({
    where: { id, utiliseA: null },
    data: { utiliseA: maintenant },
  });
  return resultat.count;
}
