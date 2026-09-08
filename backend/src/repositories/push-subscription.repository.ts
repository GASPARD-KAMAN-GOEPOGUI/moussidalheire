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

/** Purge d'un abonnement que le service push a déclaré mort (404/410) — sans
 * condition de propriétaire : l'endpoint n'existe plus nulle part. */
export async function supprimerParEndpoint(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}
