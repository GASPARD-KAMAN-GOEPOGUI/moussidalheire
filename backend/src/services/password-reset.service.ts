import { prisma } from "@/config/database";
import * as resetRepository from "@/repositories/password-reset.repository";
import {
  reinitialiserMotDePasse as ecrireNouveauMotDePasse,
  trouverParId as trouverUtilisateurParId,
} from "@/repositories/utilisateurs.repository";
import { resoudreUtilisateurPourConnexion } from "@/services/auth.service";
import { envoyerEmailCodeReinitialisation } from "@/services/email.service";
import { genererCode, normaliserCode } from "@/utils/code-otp";
import { hacherMotDePasse, verifierMotDePasse } from "@/utils/password";
import { signerTokenReinitialisation, verifierTokenReinitialisation } from "@/utils/jwt";
import { AppError } from "@/utils/app-error";
import { logger } from "@/utils/logger";
import type { Utilisateur } from "@/models/utilisateur.model";

export const DUREE_VALIDITE_CODE_MINUTES = 15;
export const TENTATIVES_MAX = 5;

/**
 * Un seul message pour toutes les causes d'échec de vérification : compte
 * inexistant, aucun code en cours, code expiré, plafond atteint, code faux.
 *
 * Indiquer le nombre d'essais restants serait plus aimable, mais trahirait
 * l'existence du compte : il suffirait de demander un code pour une adresse
 * quelconque, puis de proposer un code faux — une réponse « il vous reste 4
 * essais » confirmerait que le compte existe, contournant la réponse neutre de
 * la demande de code. Le plafond de cinq essais est annoncé dans l'e-mail et à
 * l'écran à la place.
 */
const MESSAGE_CODE_INVALIDE = "Code invalide ou expiré.";

const MESSAGE_JETON_INUTILISABLE =
  "Ce lien de réinitialisation a déjà été utilisé ou n'est plus valide. Recommencez la procédure depuis le début.";

function peutReinitialiser(utilisateur: Utilisateur | null): utilisateur is Utilisateur {
  return utilisateur !== null && utilisateur.actif && !utilisateur.supprime;
}

/**
 * Émet un nouveau code : invalide les précédents, stocke le hash, envoie le
 * mail. La suppression et la création sont groupées dans une transaction —
 * deux demandes simultanées ne doivent pas laisser deux codes valides.
 */
async function emettreCode(utilisateur: Utilisateur & { email: string }): Promise<void> {
  const code = genererCode();
  const codeHash = await hacherMotDePasse(code);
  const expiresAt = new Date(Date.now() + DUREE_VALIDITE_CODE_MINUTES * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await resetRepository.supprimerNonUtilises(utilisateur.id, tx);
    await resetRepository.creer({ utilisateurId: utilisateur.id, codeHash, expiresAt }, tx);
  });

  await envoyerEmailCodeReinitialisation({
    destinataire: utilisateur.email,
    code,
    dureeMinutes: DUREE_VALIDITE_CODE_MINUTES,
    tentativesMax: TENTATIVES_MAX,
  });
}

/**
 * `POST /auth/mot-de-passe-oublie`. Ne lève jamais d'erreur liée au compte, et
 * l'appelant renvoie la même réponse dans tous les cas : sans ça, l'endpoint
 * permettrait de découvrir quels comptes existent.
 *
 * Le travail coûteux et de durée variable — hachage bcrypt, écritures, envoi
 * SMTP — part en arrière-plan, comme les e-mails de bienvenue. S'il était
 * attendu, un compte existant répondrait en une à deux secondes et un compte
 * inconnu instantanément : la durée de réponse trahirait ce que le message
 * cache. Il subsiste un écart de quelques millisecondes dû à la recherche du
 * compte elle-même, du même ordre que celui déjà présent sur la connexion.
 *
 * Un compte sans adresse e-mail ne reçoit rien : il n'y a nulle part où
 * envoyer le code. L'écran de saisie le signale à l'utilisateur.
 */
export async function demanderCode(identifiant: string): Promise<void> {
  const utilisateur = await resoudreUtilisateurPourConnexion(identifiant);
  if (!peutReinitialiser(utilisateur) || !utilisateur.email) return;

  const destinataire = { ...utilisateur, email: utilisateur.email };
  void emettreCode(destinataire).catch((error: unknown) => {
    logger.error(
      { err: error, utilisateurId: utilisateur.id },
      "Échec de l'émission d'un code de réinitialisation.",
    );
  });
}

/**
 * `POST /auth/verifier-code`. Renvoie un jeton temporaire si le code est bon.
 *
 * L'essai est réservé AVANT la comparaison (voir
 * `resetRepository.reserverTentative`) : même sous requêtes simultanées, le
 * code ne peut pas être comparé plus de `TENTATIVES_MAX` fois. Un essai
 * réussi compte lui aussi — sans conséquence, le code étant sur le point de
 * servir.
 */
export async function verifierCode(identifiant: string, codeSaisi: string): Promise<string> {
  const utilisateur = await resoudreUtilisateurPourConnexion(identifiant);
  if (!peutReinitialiser(utilisateur)) {
    throw AppError.badRequest(MESSAGE_CODE_INVALIDE);
  }

  const jeton = await resetRepository.trouverValide(utilisateur.id, new Date(), TENTATIVES_MAX);
  if (!jeton) {
    throw AppError.badRequest(MESSAGE_CODE_INVALIDE);
  }

  const essaiDisponible = await resetRepository.reserverTentative(jeton.id, TENTATIVES_MAX);
  if (!essaiDisponible) {
    throw AppError.badRequest(MESSAGE_CODE_INVALIDE);
  }

  const codeValide = await verifierMotDePasse(normaliserCode(codeSaisi), jeton.codeHash);
  if (!codeValide) {
    throw AppError.badRequest(MESSAGE_CODE_INVALIDE);
  }

  return signerTokenReinitialisation({
    utilisateurId: utilisateur.id,
    utilisateurUuid: utilisateur.uuid,
    jetonId: jeton.id,
  });
}

/**
 * `POST /auth/reinitialiser-mot-de-passe`. Applique le nouveau mot de passe et
 * révoque toutes les sessions ouvertes.
 *
 * Tout se passe dans une transaction : consommation du code, écriture du mot
 * de passe et de `motDePasseModifieLe`, suppression des autres codes. La
 * consommation est conditionnelle (`utiliseA` encore nul) : si deux requêtes
 * présentent le même jeton, une seule aboutit.
 */
export async function reinitialiser(jetonBrut: string, nouveauMotDePasse: string): Promise<void> {
  const { utilisateurId, jetonId } = verifierTokenReinitialisation(jetonBrut);

  const jeton = await resetRepository.trouverParId(jetonId);
  if (!jeton || jeton.utilisateurId !== utilisateurId || jeton.utiliseA) {
    throw AppError.badRequest(MESSAGE_JETON_INUTILISABLE);
  }

  const utilisateur = await trouverUtilisateurParId(utilisateurId);
  if (!peutReinitialiser(utilisateur)) {
    throw AppError.badRequest(MESSAGE_JETON_INUTILISABLE);
  }

  const motDePasseHash = await hacherMotDePasse(nouveauMotDePasse);
  const maintenant = new Date();

  await prisma.$transaction(async (tx) => {
    const consomme = await resetRepository.marquerUtilise(jetonId, maintenant, tx);
    if (consomme === 0) {
      throw AppError.badRequest(MESSAGE_JETON_INUTILISABLE);
    }
    await ecrireNouveauMotDePasse(utilisateurId, motDePasseHash, maintenant, tx);
    await resetRepository.supprimerNonUtilises(utilisateurId, tx);
  });
}
