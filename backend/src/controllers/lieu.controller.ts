import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as lieuService from "@/services/lieu.service";
import { sendSuccess } from "@/utils/response";
import type { IdParam } from "@/validators/common.validator";
import type { CreateLieuInput, ListLieuQuery, UpdateLieuInput } from "@/validators/lieu.validator";

export async function creerLieu(
  req: Request<ParamsDictionary, unknown, CreateLieuInput>,
  res: Response,
): Promise<void> {
  const lieu = await lieuService.creer(req.body);
  sendSuccess(res, 201, "Lieu créé avec succès.", { lieu });
}

export async function listerLieux(req: Request<ParamsDictionary>, res: Response): Promise<void> {
  const query = req.query as unknown as ListLieuQuery;
  const { lieux, pagination } = await lieuService.lister(query);
  sendSuccess(res, 200, "Liste des lieux récupérée avec succès.", { lieux, pagination });
}

export async function obtenirLieu(req: Request<IdParam>, res: Response): Promise<void> {
  const lieu = await lieuService.obtenirParUuid(req.params.id);
  sendSuccess(res, 200, "Lieu récupéré avec succès.", { lieu });
}

export async function modifierLieu(
  req: Request<IdParam, unknown, UpdateLieuInput>,
  res: Response,
): Promise<void> {
  const lieu = await lieuService.modifier(req.params.id, req.body);
  sendSuccess(res, 200, "Lieu modifié avec succès.", { lieu });
}

export async function desactiverLieu(req: Request<IdParam>, res: Response): Promise<void> {
  const lieu = await lieuService.desactiver(req.params.id);
  sendSuccess(res, 200, "Lieu désactivé avec succès.", { lieu });
}

export async function restaurerLieu(req: Request<IdParam>, res: Response): Promise<void> {
  const lieu = await lieuService.restaurer(req.params.id);
  sendSuccess(res, 200, "Lieu restauré avec succès.", { lieu });
}
