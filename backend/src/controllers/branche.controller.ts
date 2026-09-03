import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as brancheService from "@/services/branche.service";
import { sendSuccess } from "@/utils/response";
import type { IdParam } from "@/validators/common.validator";
import type {
  CreateBrancheInput,
  ListBrancheQuery,
  UpdateBrancheInput,
} from "@/validators/branche.validator";

export async function creerBranche(
  req: Request<ParamsDictionary, unknown, CreateBrancheInput>,
  res: Response,
): Promise<void> {
  const branche = await brancheService.creer(req.body);
  sendSuccess(res, 201, "Branche créée avec succès.", { branche });
}

export async function listerBranches(req: Request<ParamsDictionary>, res: Response): Promise<void> {
  const query = req.query as unknown as ListBrancheQuery;
  const { branches, pagination } = await brancheService.lister(query);
  sendSuccess(res, 200, "Liste des branches récupérée avec succès.", { branches, pagination });
}

export async function obtenirBranche(req: Request<IdParam>, res: Response): Promise<void> {
  const branche = await brancheService.obtenirParUuid(req.params.id);
  sendSuccess(res, 200, "Branche récupérée avec succès.", { branche });
}

export async function modifierBranche(
  req: Request<IdParam, unknown, UpdateBrancheInput>,
  res: Response,
): Promise<void> {
  const branche = await brancheService.modifier(req.params.id, req.body);
  sendSuccess(res, 200, "Branche modifiée avec succès.", { branche });
}

export async function desactiverBranche(req: Request<IdParam>, res: Response): Promise<void> {
  const branche = await brancheService.desactiver(req.params.id);
  sendSuccess(res, 200, "Branche désactivée avec succès.", { branche });
}

export async function restaurerBranche(req: Request<IdParam>, res: Response): Promise<void> {
  const branche = await brancheService.restaurer(req.params.id);
  sendSuccess(res, 200, "Branche restaurée avec succès.", { branche });
}
