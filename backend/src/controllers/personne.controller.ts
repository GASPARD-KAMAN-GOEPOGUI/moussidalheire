import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as personneService from "@/services/personne.service";
import { sendSuccess } from "@/utils/response";
import { AppError } from "@/utils/app-error";
import type { IdParam } from "@/validators/common.validator";
import type {
  AjouterConjointInput,
  AjouterEnfantInput,
  CreatePersonneInput,
  ListPersonneQuery,
  UpdatePersonneInput,
} from "@/validators/personne.validator";

/**
 * req/res only — no business rules, no Prisma. Every handler here trusts that
 * `validate()` already ran (see routes/personne.routes.ts).
 */

export async function creerPersonne(
  req: Request<ParamsDictionary, unknown, CreatePersonneInput>,
  res: Response,
): Promise<void> {
  // requireAuth is the only middleware that sets req.utilisateur — if this
  // handler runs at all, it's guaranteed to be populated.
  if (!req.utilisateur) {
    throw AppError.unauthorized("Authentification requise.");
  }
  const personne = await personneService.creer(req.body, req.utilisateur.id);
  sendSuccess(res, 201, "Personne créée avec succès.", { personne });
}

export async function listerPersonnes(
  req: Request<ParamsDictionary>,
  res: Response,
): Promise<void> {
  const query = req.query as unknown as ListPersonneQuery;
  const { personnes, pagination } = await personneService.lister(query);
  sendSuccess(res, 200, "Liste des personnes récupérée avec succès.", { personnes, pagination });
}

export async function obtenirPersonne(req: Request<IdParam>, res: Response): Promise<void> {
  const personne = await personneService.obtenirParUuid(req.params.id);
  // `peutModifier` reflète, pour l'UI seulement (afficher/masquer le bouton
  // "Modifier"), la même règle que `modifierPersonne` applique réellement —
  // `attachUtilisateurSiPresent` laisse `req.utilisateur` absent pour un
  // visiteur anonyme, auquel cas la modification n'est jamais permise.
  const peutModifier = req.utilisateur
    ? personneService.peutModifierPersonne(req.utilisateur, personne)
    : false;
  sendSuccess(res, 200, "Personne récupérée avec succès.", { personne: { ...personne, peutModifier } });
}

export async function modifierPersonne(
  req: Request<IdParam, unknown, UpdatePersonneInput>,
  res: Response,
): Promise<void> {
  if (!req.utilisateur) {
    throw AppError.unauthorized("Authentification requise.");
  }
  const personne = await personneService.modifier(req.params.id, req.body, req.utilisateur);
  sendSuccess(res, 200, "Personne modifiée avec succès.", { personne });
}

export async function desactiverPersonne(req: Request<IdParam>, res: Response): Promise<void> {
  const personne = await personneService.desactiver(req.params.id);
  sendSuccess(res, 200, "Personne désactivée avec succès.", { personne });
}

export async function restaurerPersonne(req: Request<IdParam>, res: Response): Promise<void> {
  const personne = await personneService.restaurer(req.params.id);
  sendSuccess(res, 200, "Personne restaurée avec succès.", { personne });
}

export async function listerEnfantsPersonne(req: Request<IdParam>, res: Response): Promise<void> {
  const enfants = await personneService.listerEnfants(req.params.id);
  sendSuccess(res, 200, "Enfants récupérés avec succès.", { enfants });
}

export async function listerFratriePersonne(req: Request<IdParam>, res: Response): Promise<void> {
  const fratrie = await personneService.listerFratrie(req.params.id);
  sendSuccess(res, 200, "Fratrie récupérée avec succès.", { fratrie });
}

export async function listerConjointsPersonne(req: Request<IdParam>, res: Response): Promise<void> {
  const conjoints = await personneService.listerConjoints(req.params.id);
  sendSuccess(res, 200, "Conjoint·e·s récupéré·e·s avec succès.", { conjoints });
}

/**
 * "Ajouter mes enfants" — `req.utilisateur.personneId` (jamais le corps de la
 * requête) détermine le parent ; `requireAuth` garantit que `req.utilisateur`
 * est déjà attaché ici (voir routes/personne.routes.ts).
 */
export async function ajouterEnfantAuConnecte(
  req: Request<ParamsDictionary, unknown, AjouterEnfantInput>,
  res: Response,
): Promise<void> {
  if (!req.utilisateur?.personneId) {
    throw AppError.forbidden("Votre compte n'est associé à aucune fiche personne.");
  }
  const { enfant, compte } = await personneService.creerEnfantConnecte(
    req.utilisateur.personneId,
    req.body,
    req.utilisateur.id,
  );
  sendSuccess(res, 201, "Enfant ajouté avec succès.", { personne: enfant, compte });
}

/**
 * "Ajouter mon/ma conjoint·e" — `req.utilisateur.personneId` (jamais le corps
 * de la requête) détermine la personne connectée ; `requireAuth` garantit que
 * `req.utilisateur` est déjà attaché ici (voir routes/personne.routes.ts).
 */
export async function ajouterConjointAuConnecte(
  req: Request<ParamsDictionary, unknown, AjouterConjointInput>,
  res: Response,
): Promise<void> {
  if (!req.utilisateur?.personneId) {
    throw AppError.forbidden("Votre compte n'est associé à aucune fiche personne.");
  }
  const { conjoint, compte } = await personneService.creerConjointConnecte(
    req.utilisateur.personneId,
    req.body,
    req.utilisateur.id,
  );
  sendSuccess(res, 201, "Conjoint·e ajouté·e avec succès.", { personne: conjoint, compte });
}
