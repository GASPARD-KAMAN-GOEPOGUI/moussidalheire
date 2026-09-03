import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as categorieActualiteService from "@/services/categorie-actualite.service";
import { sendSuccess } from "@/utils/response";
import type { IdParam } from "@/validators/common.validator";
import type {
  CreateCategorieActualiteInput,
  ListCategorieActualiteQuery,
  UpdateCategorieActualiteInput,
} from "@/validators/categorie-actualite.validator";

export async function creerCategorieActualite(
  req: Request<ParamsDictionary, unknown, CreateCategorieActualiteInput>,
  res: Response,
): Promise<void> {
  const categorie = await categorieActualiteService.creer(req.body);
  sendSuccess(res, 201, "Catégorie d'actualité créée avec succès.", { categorie });
}

export async function listerCategoriesActualites(
  req: Request<ParamsDictionary>,
  res: Response,
): Promise<void> {
  const query = req.query as unknown as ListCategorieActualiteQuery;
  const { categories, pagination } = await categorieActualiteService.lister(query);
  sendSuccess(res, 200, "Liste des catégories d'actualités récupérée avec succès.", {
    categories,
    pagination,
  });
}

export async function obtenirCategorieActualite(
  req: Request<IdParam>,
  res: Response,
): Promise<void> {
  const categorie = await categorieActualiteService.obtenirParUuid(req.params.id);
  sendSuccess(res, 200, "Catégorie d'actualité récupérée avec succès.", { categorie });
}

export async function modifierCategorieActualite(
  req: Request<IdParam, unknown, UpdateCategorieActualiteInput>,
  res: Response,
): Promise<void> {
  const categorie = await categorieActualiteService.modifier(req.params.id, req.body);
  sendSuccess(res, 200, "Catégorie d'actualité modifiée avec succès.", { categorie });
}

export async function desactiverCategorieActualite(
  req: Request<IdParam>,
  res: Response,
): Promise<void> {
  const categorie = await categorieActualiteService.desactiver(req.params.id);
  sendSuccess(res, 200, "Catégorie d'actualité désactivée avec succès.", { categorie });
}

export async function restaurerCategorieActualite(
  req: Request<IdParam>,
  res: Response,
): Promise<void> {
  const categorie = await categorieActualiteService.restaurer(req.params.id);
  sendSuccess(res, 200, "Catégorie d'actualité restaurée avec succès.", { categorie });
}
