import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as pushService from "@/services/push.service";
import { sendSuccess } from "@/utils/response";
import { AppError } from "@/utils/app-error";
import type {
  CreerAbonnementPushInput,
  SupprimerAbonnementPushInput,
} from "@/validators/push.validator";

export function obtenirClePubliquePush(_req: Request, res: Response): void {
  sendSuccess(res, 200, "Clé publique VAPID récupérée avec succès.", {
    clePublique: pushService.obtenirClePublique(),
  });
}

export async function enregistrerAbonnementPush(
  req: Request<ParamsDictionary, unknown, CreerAbonnementPushInput>,
  res: Response,
): Promise<void> {
  // `requireAuth` garantit la présence de req.utilisateur ; ce garde-fou ne
  // sert qu'à satisfaire le typage sans forcer un `!`.
  if (!req.utilisateur) throw AppError.unauthorized("Authentification requise.");

  await pushService.enregistrerAbonnement(req.utilisateur.id, req.body, req.headers["user-agent"]);
  sendSuccess(res, 201, "Abonnement aux notifications enregistré avec succès.");
}

export async function supprimerAbonnementPush(
  req: Request<ParamsDictionary, unknown, SupprimerAbonnementPushInput>,
  res: Response,
): Promise<void> {
  if (!req.utilisateur) throw AppError.unauthorized("Authentification requise.");

  const supprime = await pushService.supprimerAbonnement(req.utilisateur.id, req.body.endpoint);
  if (!supprime) throw AppError.notFound("Aucun abonnement ne correspond à cet appareil.");

  sendSuccess(res, 200, "Abonnement aux notifications supprimé avec succès.");
}
