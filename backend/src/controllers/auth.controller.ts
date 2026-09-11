import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as authService from "@/services/auth.service";
import * as passwordResetService from "@/services/password-reset.service";
import { sendSuccess } from "@/utils/response";
import { AppError } from "@/utils/app-error";
import type {
  ChangerMotDePasseInput,
  ConnexionInput,
  InscriptionInput,
  MotDePasseOublieInput,
  RafraichirInput,
  ReinitialiserMotDePasseInput,
  VerifierCodeInput,
} from "@/validators/auth.validator";

/**
 * req/res only — no business rules, no Prisma. `validate()` already ran on
 * `req.body` (see routes/auth.routes.ts) for inscription/connexion;
 * `requireAuth` already ran and populated `req.utilisateur` for `moi`.
 */

export async function inscription(
  req: Request<ParamsDictionary, unknown, InscriptionInput>,
  res: Response,
): Promise<void> {
  const {
    personne,
    utilisateur,
    token,
    refreshToken,
    motDePasseTemporaire,
    pere,
    mere,
    fratrie,
    unions,
    enfantsAutres,
    fratrieMeresCreees,
  } = await authService.inscrire(req.body);
  sendSuccess(res, 201, "Inscription réussie.", {
    personne,
    utilisateur,
    token,
    refreshToken,
    motDePasseTemporaire,
    pere,
    mere,
    fratrie,
    unions,
    enfantsAutres,
    fratrieMeresCreees,
  });
}

export async function connexion(
  req: Request<ParamsDictionary, unknown, ConnexionInput>,
  res: Response,
): Promise<void> {
  const { utilisateur, token, refreshToken } = await authService.connecter(req.body);
  sendSuccess(res, 200, "Connexion réussie.", { utilisateur, token, refreshToken });
}

/** No `requireAuth` — a request here almost always follows the access token
 * having just expired, so the header the client could offer is exactly what
 * we can no longer trust; the (long-lived) refresh token in the body is the
 * only credential this endpoint needs. */
export async function rafraichir(
  req: Request<ParamsDictionary, unknown, RafraichirInput>,
  res: Response,
): Promise<void> {
  const { token, refreshToken } = await authService.rafraichir(req.body);
  sendSuccess(res, 200, "Session rafraîchie.", { token, refreshToken });
}

export async function moi(req: Request, res: Response): Promise<void> {
  // requireAuth is the only middleware that sets req.utilisateur — if this
  // handler runs at all, it's guaranteed to be populated.
  if (!req.utilisateur) {
    throw AppError.unauthorized("Authentification requise.");
  }
  const utilisateur = await authService.moi(req.utilisateur);
  sendSuccess(res, 200, "Utilisateur courant récupéré avec succès.", { utilisateur });
}

export async function changerMotDePasse(
  req: Request<ParamsDictionary, unknown, ChangerMotDePasseInput>,
  res: Response,
): Promise<void> {
  // requireAuth is the only middleware that sets req.utilisateur — if this
  // handler runs at all, it's guaranteed to be populated.
  if (!req.utilisateur) {
    throw AppError.unauthorized("Authentification requise.");
  }
  await authService.changerMotDePasse(req.utilisateur.id, req.body);
  sendSuccess(res, 200, "Mot de passe mis à jour avec succès.");
}

/**
 * Réponse strictement identique que le compte existe ou non — voir
 * password-reset.service.ts::demanderCode. Le message évoque donc
 * l'éventualité (« si un compte correspond ») plutôt qu'un envoi certain.
 */
export async function motDePasseOublie(
  req: Request<ParamsDictionary, unknown, MotDePasseOublieInput>,
  res: Response,
): Promise<void> {
  await passwordResetService.demanderCode(req.body.identifiant);
  sendSuccess(
    res,
    200,
    "Si un compte correspond à cet identifiant, un code de réinitialisation vient d'être envoyé à l'adresse e-mail associée.",
    { dureeValiditeMinutes: passwordResetService.DUREE_VALIDITE_CODE_MINUTES },
  );
}

export async function verifierCode(
  req: Request<ParamsDictionary, unknown, VerifierCodeInput>,
  res: Response,
): Promise<void> {
  const jeton = await passwordResetService.verifierCode(req.body.identifiant, req.body.code);
  sendSuccess(res, 200, "Code vérifié. Vous pouvez définir votre nouveau mot de passe.", { jeton });
}

export async function reinitialiserMotDePasse(
  req: Request<ParamsDictionary, unknown, ReinitialiserMotDePasseInput>,
  res: Response,
): Promise<void> {
  await passwordResetService.reinitialiser(req.body.jeton, req.body.nouveauMotDePasse);
  sendSuccess(
    res,
    200,
    "Votre mot de passe a été réinitialisé. Toutes vos sessions ont été fermées : connectez-vous avec votre nouveau mot de passe.",
  );
}
