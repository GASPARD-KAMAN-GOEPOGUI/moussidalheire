import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as unionService from "@/services/union.service";
import { sendSuccess } from "@/utils/response";
import type { IdParam } from "@/validators/common.validator";
import type {
  CreateUnionInput,
  ListUnionQuery,
  UpdateUnionInput,
} from "@/validators/union.validator";

export async function creerUnion(
  req: Request<ParamsDictionary, unknown, CreateUnionInput>,
  res: Response,
): Promise<void> {
  const union = await unionService.creer(req.body);
  sendSuccess(res, 201, "Union créée avec succès.", { union });
}

export async function listerUnions(req: Request<ParamsDictionary>, res: Response): Promise<void> {
  const query = req.query as unknown as ListUnionQuery;
  const { unions, pagination } = await unionService.lister(query);
  sendSuccess(res, 200, "Liste des unions récupérée avec succès.", { unions, pagination });
}

export async function obtenirUnion(req: Request<IdParam>, res: Response): Promise<void> {
  const union = await unionService.obtenirParUuid(req.params.id);
  sendSuccess(res, 200, "Union récupérée avec succès.", { union });
}

export async function modifierUnion(
  req: Request<IdParam, unknown, UpdateUnionInput>,
  res: Response,
): Promise<void> {
  const union = await unionService.modifier(req.params.id, req.body);
  sendSuccess(res, 200, "Union modifiée avec succès.", { union });
}

export async function desactiverUnion(req: Request<IdParam>, res: Response): Promise<void> {
  const union = await unionService.desactiver(req.params.id);
  sendSuccess(res, 200, "Union désactivée avec succès.", { union });
}

export async function restaurerUnion(req: Request<IdParam>, res: Response): Promise<void> {
  const union = await unionService.restaurer(req.params.id);
  sendSuccess(res, 200, "Union restaurée avec succès.", { union });
}
