import type { PushSubscription } from "@prisma/client";
import { prisma } from "@/config/database";

/**
 * Seul module autorisé à appeler `prisma.pushSubscription.*`. Aucune règle
 * métier ici (l'envoi, la purge des abonnements morts et la vérification
 * d'appartenance vivent dans services/push.service.ts) — uniquement des
 * lectures/écritures typées.
 *
 * Contrairement aux autres tables, la suppression est bien physique : un
 * abonnement révoqué par le navigateur n'a aucune valeur historique, et le
 * conserver ferait grossir la table d'endpoints vers lesquels on émettrait
 * indéfiniment dans le vide.
 */

export interface DonneesAbonnement {
  endpoint: string;
  p256dh: string;
  auth: string;
  utilisateurId: number;
  userAgent?: string | null;
}

/**
 * Upsert sur `endpoint`, jamais un `create` : un navigateur peut renouveler un
 * abonnement existant (rotation de clés, réinstallation), et créer une seconde
 * ligne pour le même appareil ferait partir chaque notification en double.
 *
 * `utilisateurId` fait partie de la mise à jour : si un autre compte se
 * connecte sur le même appareil, l'abonnement doit le suivre, sinon les
 * notifications continueraient d'être adressées au compte précédent.
 */
export function upsert(donnees: DonneesAbonnement): Promise<PushSubscription> {
  const { endpoint, ...reste } = donnees;
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...reste },
    update: reste,
  });
}

/**
 * Tous les abonnements, tous comptes confondus — pour une diffusion générale
 * (publication d'une actualité). À l'échelle du village, le nombre de lignes
 * se compte en dizaines : les charger d'un coup est sans conséquence. Si la
 * population d'abonnés devenait importante, il faudrait paginer et envoyer par
 * lots plutôt que de tout garder en mémoire.
 */
export function listerTous(): Promise<PushSubscription[]> {
  return prisma.pushSubscription.findMany({ orderBy: { createdAt: "desc" } });
}

export function listerParUtilisateur(utilisateurId: number): Promise<PushSubscription[]> {
  return prisma.pushSubscription.findMany({
    where: { utilisateurId },
    orderBy: { createdAt: "desc" },
  });
}

/** Restreint au propriétaire : un endpoint est unique globalement, sans ce
 * filtre n'importe quel compte pourrait désabonner l'appareil d'un autre. */
export async function supprimerPourUtilisateur(
  endpoint: string,
  utilisateurId: number,
): Promise<number> {
  const { count } = await prisma.pushSubscription.deleteMany({
    where: { endpoint, utilisateurId },
  });
  return count;
}

/** Purge d'un abonnement que le service push a déclaré inutilisable
 * (401/403/404/410, voir push.service.ts) — sans condition de propriétaire :
 * l'endpoint ne peut plus rien recevoir de ce serveur. */
export async function supprimerParEndpoint(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}
