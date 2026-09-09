import webpush, { WebPushError } from "web-push";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import * as pushRepository from "@/repositories/push-subscription.repository";
import type { CreerAbonnementPushInput } from "@/validators/push.validator";

/**
 * Notifications Web Push.
 *
 * Les identifiants VAPID sont posés une seule fois, au chargement du module :
 * `env` les a déjà validés au démarrage (longueur décodée comprise), donc cet
 * appel ne peut pas échouer sur une clé malformée.
 */
webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

/** Codes par lesquels un service push signale un abonnement définitivement
 * mort : application désinstallée, données du navigateur effacées, ou
 * autorisation révoquée. Toute autre erreur (429, 5xx) est temporaire et ne
 * doit surtout pas entraîner de suppression. */
const CODES_ABONNEMENT_MORT = new Set([404, 410]);

export interface ContenuNotification {
  titre: string;
  corps: string;
  /** Chemin ouvert au clic sur la notification (voir le listener
   * `notificationclick` du service worker). */
  url?: string;
}

export function obtenirClePublique(): string {
  return env.VAPID_PUBLIC_KEY;
}

export async function enregistrerAbonnement(
  utilisateurId: number,
  input: CreerAbonnementPushInput,
  userAgent?: string,
): Promise<void> {
  await pushRepository.upsert({
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    utilisateurId,
    // Tronqué à la capacité de la colonne : certains navigateurs envoient des
    // User-Agent très longs, et un dépassement ferait échouer l'abonnement
    // entier pour une donnée qui n'est que du confort de diagnostic.
    userAgent: userAgent?.slice(0, 500) ?? null,
  });
}

export async function supprimerAbonnement(
  utilisateurId: number,
  endpoint: string,
): Promise<boolean> {
  const supprimes = await pushRepository.supprimerPourUtilisateur(endpoint, utilisateurId);
  return supprimes > 0;
}

/**
 * Envoie une notification à tous les appareils d'un utilisateur.
 *
 * Ne rejette jamais : une notification est accessoire, elle ne doit pas faire
 * échouer l'action métier qui l'a déclenchée (publier une actualité, par
 * exemple). Les échecs sont journalisés, et les abonnements morts purgés au
 * passage — sans quoi la table accumulerait des endpoints fantômes.
 */
export interface BilanEnvoi {
  envoyes: number;
  echecs: number;
  purges: number;
}

/** Envoi effectif vers une liste d'abonnements, avec purge des morts. */
async function envoyerVers(
  abonnements: { endpoint: string; p256dh: string; auth: string }[],
  contenu: ContenuNotification,
): Promise<BilanEnvoi> {
  const charge = JSON.stringify(contenu);
  let envoyes = 0;
  let echecs = 0;
  let purges = 0;

  await Promise.all(
    abonnements.map(async (abonnement) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: abonnement.endpoint,
            keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
          },
          charge,
        );
        envoyes += 1;
      } catch (error) {
        echecs += 1;
        if (error instanceof WebPushError && CODES_ABONNEMENT_MORT.has(error.statusCode)) {
          await pushRepository.supprimerParEndpoint(abonnement.endpoint);
          purges += 1;
          return;
        }
        logger.warn(
          { err: error, endpoint: abonnement.endpoint.slice(0, 60) },
          "Échec d'envoi d'une notification push",
        );
      }
    }),
  );

  return { envoyes, echecs, purges };
}

export async function envoyerAUtilisateur(
  utilisateurId: number,
  contenu: ContenuNotification,
): Promise<BilanEnvoi> {
  return envoyerVers(await pushRepository.listerParUtilisateur(utilisateurId), contenu);
}

/**
 * Diffusion à tous les appareils abonnés, sans distinction de compte — c'est
 * le choix retenu pour les actualités : tout membre abonné reçoit tout.
 *
 * L'auteur de la publication est inclus : il est abonné comme les autres, et
 * l'exclure demanderait de propager son identité jusqu'ici pour un bénéfice
 * discutable (il verra simplement sa propre annonce arriver).
 */
export async function envoyerATous(contenu: ContenuNotification): Promise<BilanEnvoi> {
  const abonnements = await pushRepository.listerTous();
  const bilan = await envoyerVers(abonnements, contenu);
  logger.info(
    { titre: contenu.titre, abonnements: abonnements.length, ...bilan },
    "Diffusion push terminée",
  );
  return bilan;
}
