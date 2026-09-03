import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as authService from "@/services/auth.service";
import { sendSuccess } from "@/utils/response";
import { AppError } from "@/utils/app-error";
import type {
  ChangerMotDePasseInput,
  ConnexionInput,
  InscriptionInput,
  RafraichirInput,
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
