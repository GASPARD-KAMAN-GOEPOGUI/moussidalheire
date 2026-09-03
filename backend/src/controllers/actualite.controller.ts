import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as actualiteService from "@/services/actualite.service";
import { sendSuccess } from "@/utils/response";
import type { IdParam } from "@/validators/common.validator";
import type {
  CreateActualiteInput,
  ListActualiteQuery,
  UpdateActualiteInput,
} from "@/validators/actualite.validator";

export async function creerActualite(
  req: Request<ParamsDictionary, unknown, CreateActualiteInput>,
  res: Response,
): Promise<void> {
  const actualite = await actualiteService.creer(req.body);
  sendSuccess(res, 201, "Actualité créée avec succès.", { actualite });
}

export async function listerActualites(
  req: Request<ParamsDictionary>,
  res: Response,
): Promise<void> {
  const query = req.query as unknown as ListActualiteQuery;
  const { actualites, pagination } = await actualiteService.lister(query);
  sendSuccess(res, 200, "Liste des actualités récupérée avec succès.", { actualites, pagination });
}

export async function obtenirActualite(req: Request<IdParam>, res: Response): Promise<void> {
  const actualite = await actualiteService.obtenirParUuid(req.params.id);
  sendSuccess(res, 200, "Actualité récupérée avec succès.", { actualite });
}

export async function modifierActualite(
  req: Request<IdParam, unknown, UpdateActualiteInput>,
  res: Response,
): Promise<void> {
  const actualite = await actualiteService.modifier(req.params.id, req.body);
  sendSuccess(res, 200, "Actualité modifiée avec succès.", { actualite });
}

export async function desactiverActualite(req: Request<IdParam>, res: Response): Promise<void> {
  const actualite = await actualiteService.desactiver(req.params.id);
  sendSuccess(res, 200, "Actualité désactivée avec succès.", { actualite });
}

export async function restaurerActualite(req: Request<IdParam>, res: Response): Promise<void> {
  const actualite = await actualiteService.restaurer(req.params.id);
  sendSuccess(res, 200, "Actualité restaurée avec succès.", { actualite });
}
