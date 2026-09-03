import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import {
  attachUtilisateurSiPresent,
  requireAuth,
  requireRole,
} from "@/middlewares/auth.middleware";
import {
  creerBranche,
  desactiverBranche,
  listerBranches,
  modifierBranche,
  obtenirBranche,
  restaurerBranche,
} from "@/controllers/branche.controller";
import {
  createBrancheSchema,
  listBrancheQuerySchema,
  updateBrancheSchema,
} from "@/validators/branche.validator";
import { idParamSchema } from "@/validators/common.validator";

/** 🟡 `branche` is still "à décider" — generic CRUD, nothing
 * business-specific. Lecture publique (`attachUtilisateurSiPresent`) ;
 * organiser une famille en branches est un geste structurel réservé aux
 * admins (`requireAuth` + `requireRole("admin")`), comme pour `familles`. */
export const brancheRouter = Router();

/**
 * @openapi
 * /branches:
 *   post:
 *     summary: Créer une branche (générique, sans règle métier — table 🟡 à décider)
 *     tags: [Branches]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [familleId, nom]
 *             properties:
 *               familleId: { type: integer }
 *               nom: { type: string }
 *               description: { type: string }
 *               statut: { type: string }
 *     responses:
 *       201:
 *         description: Branche créée.
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 */
brancheRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validate(createBrancheSchema),
  creerBranche,
);

/**
 * @openapi
 * /branches:
 *   get:
 *     summary: Lister les branches (paginé, recherche, filtres)
 *     tags: [Branches]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: recherche
 *         schema: { type: string }
 *       - in: query
 *         name: familleId
 *         schema: { type: integer }
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: Liste paginée des branches.
 */
brancheRouter.get(
  "/",
  attachUtilisateurSiPresent,
  validate(listBrancheQuerySchema, "query"),
  listerBranches,
);

/**
 * @openapi
 * /branches/{id}:
 *   get:
 *     summary: Obtenir une branche par son identifiant public (uuid)
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: La branche trouvée.
 *       404:
 *         description: Branche introuvable.
 */
brancheRouter.get(
  "/:id",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  obtenirBranche,
);

/**
 * @openapi
 * /branches/{id}:
 *   put:
 *     summary: Modifier complètement une branche (aucune route PATCH n'existe)
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [familleId, nom]
 *     responses:
 *       200:
 *         description: Branche modifiée.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Branche introuvable.
 */
brancheRouter.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  validate(updateBrancheSchema),
  modifierBranche,
);

/**
 * @openapi
 * /branches/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) une branche — jamais de suppression physique
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Branche désactivée (deletedAt renseigné).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Branche introuvable.
 */
brancheRouter.post(
  "/:id/desactiver",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  desactiverBranche,
);

/**
 * @openapi
 * /branches/{id}/restaurer:
 *   post:
 *     summary: Restaurer une branche désactivée
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Branche restaurée (deletedAt=null).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Branche introuvable.
 */
brancheRouter.post(
  "/:id/restaurer",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  restaurerBranche,
);
