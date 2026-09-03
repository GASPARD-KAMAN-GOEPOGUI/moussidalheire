import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as familleService from "@/services/famille.service";
import type { UniversFamilial } from "@/services/famille.service";
import { sendSuccess } from "@/utils/response";
import type { IdParam } from "@/validators/common.validator";
import type {
  CreateFamilleInput,
  ListFamilleQuery,
  UpdateFamilleInput,
} from "@/validators/famille.validator";

/** Pas d'utilisateur (appel non authentifié, ex. le formulaire d'inscription)
 * → "toutes" : comportement public inchangé. Voir `attachUtilisateurSiPresent`. */
function resoudreUniversDepuisRequete(req: Request): Promise<UniversFamilial> {
  if (!req.utilisateur) return Promise.resolve("toutes");
  return familleService.resoudreUniversFamilial(req.utilisateur);
}

export async function creerFamille(
  req: Request<ParamsDictionary, unknown, CreateFamilleInput>,
  res: Response,
): Promise<void> {
  const famille = await familleService.creer(req.body);
  sendSuccess(res, 201, "Famille créée avec succès.", { famille });
}

export async function listerFamilles(req: Request<ParamsDictionary>, res: Response): Promise<void> {
  const query = req.query as unknown as ListFamilleQuery;
  const univers = await resoudreUniversDepuisRequete(req);
  const { familles, pagination } = await familleService.lister(query, univers);
  sendSuccess(res, 200, "Liste des familles récupérée avec succès.", { familles, pagination });
}

export async function obtenirFamille(req: Request<IdParam>, res: Response): Promise<void> {
  const univers = await resoudreUniversDepuisRequete(req);
  const famille = await familleService.obtenirParUuid(req.params.id, univers);
  sendSuccess(res, 200, "Famille récupérée avec succès.", { famille });
}

export async function modifierFamille(
  req: Request<IdParam, unknown, UpdateFamilleInput>,
  res: Response,
): Promise<void> {
  const famille = await familleService.modifier(req.params.id, req.body);
  sendSuccess(res, 200, "Famille modifiée avec succès.", { famille });
}

export async function desactiverFamille(req: Request<IdParam>, res: Response): Promise<void> {
  const famille = await familleService.desactiver(req.params.id);
  sendSuccess(res, 200, "Famille désactivée avec succès.", { famille });
}

export async function restaurerFamille(req: Request<IdParam>, res: Response): Promise<void> {
  const famille = await familleService.restaurer(req.params.id);
  sendSuccess(res, 200, "Famille restaurée avec succès.", { famille });
}

export async function listerFamillesRelatives(req: Request<IdParam>, res: Response): Promise<void> {
  const univers = await resoudreUniversDepuisRequete(req);
  const relatives = await familleService.listerRelatives(req.params.id, univers);
  sendSuccess(res, 200, "Familles relatives récupérées avec succès.", { relatives });
}

export async function obtenirChaineFamille(req: Request<IdParam>, res: Response): Promise<void> {
  const univers = await resoudreUniversDepuisRequete(req);
  const chaine = await familleService.obtenirChaine(req.params.id, univers);
  sendSuccess(res, 200, "Chaîne généalogique de la famille récupérée avec succès.", { chaine });
}
