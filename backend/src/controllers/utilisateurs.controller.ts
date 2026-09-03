import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import * as utilisateursService from "@/services/utilisateurs.service";
import type { ApiSuccess } from "@/types/api-response";
import type { UtilisateurPublic } from "@/types/utilisateur";
import type { Pagination } from "@/services/utilisateurs.service";
import type { CreateUtilisateurInput } from "@/schemas/utilisateurs/create-utilisateur.schema";
import type { UpdateUtilisateurInput } from "@/schemas/utilisateurs/update-utilisateur.schema";
import type { ListUtilisateursQuery } from "@/schemas/utilisateurs/list-utilisateurs.schema";
import type { UuidParam } from "@/schemas/utilisateurs/utilisateur.primitives";

/**
 * req/res only — no business rules, no Prisma. Every handler here trusts that
 * `validate()` already ran (see routes/utilisateurs.routes.ts): `req.body`/`req.params`/
 * `req.query` are the parsed, typed Zod output, not raw input.
 */

type UtilisateurResponse = ApiSuccess & { utilisateur: UtilisateurPublic };
type UtilisateursListResponse = ApiSuccess & {
  utilisateurs: UtilisateurPublic[];
  pagination: Pagination;
};

export async function creerUtilisateur(
  req: Request<ParamsDictionary, unknown, CreateUtilisateurInput>,
  res: Response<UtilisateurResponse>,
): Promise<void> {
  const utilisateur = await utilisateursService.creerUtilisateur(req.body);
  res.status(201).json({
    success: true,
    message: "Utilisateur créé avec succès.",
    utilisateur,
  });
}

export async function listerUtilisateurs(
  req: Request<ParamsDictionary>,
  res: Response<UtilisateursListResponse>,
): Promise<void> {
  // Express's built-in `Request` types `req.query` as the generic `ParsedQs` — a plain
  // cast to our Zod-inferred shape here is safe because `validate(schema, "query")`
  // already replaced `req.query` with the parsed/typed/defaulted output at runtime
  // (see middlewares/validate.middleware.ts) before this handler ever runs.
  const query = req.query as unknown as ListUtilisateursQuery;
  const { utilisateurs, pagination } = await utilisateursService.listerUtilisateurs(query);
  res.status(200).json({
    success: true,
    message: "Liste des utilisateurs récupérée avec succès.",
    utilisateurs,
    pagination,
  });
}

export async function obtenirUtilisateur(
  req: Request<UuidParam>,
  res: Response<UtilisateurResponse>,
): Promise<void> {
  const utilisateur = await utilisateursService.obtenirUtilisateurParUuid(req.params.id);
  res.status(200).json({
    success: true,
    message: "Utilisateur récupéré avec succès.",
    utilisateur,
  });
}

export async function modifierUtilisateur(
  req: Request<UuidParam, unknown, UpdateUtilisateurInput>,
  res: Response<UtilisateurResponse>,
): Promise<void> {
  const utilisateur = await utilisateursService.modifierUtilisateur(req.params.id, req.body);
  res.status(200).json({
    success: true,
    message: "Utilisateur modifié avec succès.",
    utilisateur,
  });
}

export async function desactiverUtilisateur(
  req: Request<UuidParam>,
  res: Response<UtilisateurResponse>,
): Promise<void> {
  const utilisateur = await utilisateursService.desactiverUtilisateur(req.params.id);
  res.status(200).json({
    success: true,
    message: "Utilisateur désactivé avec succès.",
    utilisateur,
  });
}

export async function reactiverUtilisateur(
  req: Request<UuidParam>,
  res: Response<UtilisateurResponse>,
): Promise<void> {
  const utilisateur = await utilisateursService.reactiverUtilisateur(req.params.id);
  res.status(200).json({
    success: true,
    message: "Utilisateur réactivé avec succès.",
    utilisateur,
  });
}
