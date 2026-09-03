import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as residencePersonneService from "@/services/residence-personne.service";
import { sendSuccess } from "@/utils/response";
import type { IdParam } from "@/validators/common.validator";
import type {
  CreateResidencePersonneInput,
  ListResidencePersonneQuery,
  UpdateResidencePersonneInput,
} from "@/validators/residence-personne.validator";

export async function creerResidencePersonne(
  req: Request<ParamsDictionary, unknown, CreateResidencePersonneInput>,
  res: Response,
): Promise<void> {
  const residence = await residencePersonneService.creer(req.body);
  sendSuccess(res, 201, "Résidence créée avec succès.", { residence });
}

export async function listerResidencesPersonnes(
  req: Request<ParamsDictionary>,
  res: Response,
): Promise<void> {
  const query = req.query as unknown as ListResidencePersonneQuery;
  const { residences, pagination } = await residencePersonneService.lister(query);
  sendSuccess(res, 200, "Liste des résidences récupérée avec succès.", { residences, pagination });
}

export async function obtenirResidencePersonne(
  req: Request<IdParam>,
  res: Response,
): Promise<void> {
  const residence = await residencePersonneService.obtenirParUuid(req.params.id);
  sendSuccess(res, 200, "Résidence récupérée avec succès.", { residence });
}

export async function modifierResidencePersonne(
  req: Request<IdParam, unknown, UpdateResidencePersonneInput>,
  res: Response,
): Promise<void> {
  const residence = await residencePersonneService.modifier(req.params.id, req.body);
  sendSuccess(res, 200, "Résidence modifiée avec succès.", { residence });
}

export async function desactiverResidencePersonne(
  req: Request<IdParam>,
  res: Response,
): Promise<void> {
  const residence = await residencePersonneService.desactiver(req.params.id);
  sendSuccess(res, 200, "Résidence désactivée avec succès.", { residence });
}

export async function restaurerResidencePersonne(
  req: Request<IdParam>,
  res: Response,
): Promise<void> {
  const residence = await residencePersonneService.restaurer(req.params.id);
  sendSuccess(res, 200, "Résidence restaurée avec succès.", { residence });
}
