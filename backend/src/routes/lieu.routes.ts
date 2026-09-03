import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { attachUtilisateurSiPresent, requireAuth, requireRole } from "@/middlewares/auth.middleware";
import {
  creerLieu,
  desactiverLieu,
  listerLieux,
  modifierLieu,
  obtenirLieu,
  restaurerLieu,
} from "@/controllers/lieu.controller";
import {
  createLieuSchema,
  listLieuQuerySchema,
  updateLieuSchema,
} from "@/validators/lieu.validator";
import { idParamSchema } from "@/validators/common.validator";

/** Référentiel de lieux réutilisé par `residence-personne` pour la résidence
 * actuelle d'une personne. Lecture (GET) : `attachUtilisateurSiPresent`,
 * jamais bloquant, comme `personnes`/`familles`. Créer/modifier : `requireAuth`
 * seul — tout membre connecté peut ajouter un lieu manquant en renseignant sa
 * résidence. Désactiver/restaurer : réservé aux administrateurs. */
export const lieuRouter = Router();

/**
 * @openapi
 * /lieux:
 *   post:
 *     summary: Créer un lieu (générique, sans règle métier)
 *     tags: [Lieux]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pays, ville]
 *             properties:
 *               pays: { type: string }
 *               region: { type: string }
 *               ville: { type: string }
 *               quartier: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               estVillage: { type: boolean }
 *     responses:
 *       201:
 *         description: Lieu créé.
 *       400:
 *         description: Erreur de validation.
 */
lieuRouter.post("/", requireAuth, validate(createLieuSchema), creerLieu);

/**
 * @openapi
 * /lieux:
 *   get:
 *     summary: Lister les lieux (paginé, recherche, filtres)
 *     tags: [Lieux]
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
 *         description: Recherche sur ville/pays.
 *       - in: query
 *         name: estVillage
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: Liste paginée des lieux.
 */
lieuRouter.get(
  "/",
  attachUtilisateurSiPresent,
  validate(listLieuQuerySchema, "query"),
  listerLieux,
);

/**
 * @openapi
 * /lieux/{id}:
 *   get:
 *     summary: Obtenir un lieu par son identifiant public (uuid)
 *     tags: [Lieux]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Le lieu trouvé.
 *       404:
 *         description: Lieu introuvable.
 */
lieuRouter.get(
  "/:id",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  obtenirLieu,
);

/**
 * @openapi
 * /lieux/{id}:
 *   put:
 *     summary: Modifier complètement un lieu (aucune route PATCH n'existe)
 *     tags: [Lieux]
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
 *             required: [pays, ville]
 *     responses:
 *       200:
 *         description: Lieu modifié.
 *       404:
 *         description: Lieu introuvable.
 */
lieuRouter.put(
  "/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(updateLieuSchema),
  modifierLieu,
);

/**
 * @openapi
 * /lieux/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) un lieu — jamais de suppression physique
 *     tags: [Lieux]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lieu désactivé (deletedAt renseigné).
 *       404:
 *         description: Lieu introuvable.
 */
lieuRouter.post(
  "/:id/desactiver",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  desactiverLieu,
);

/**
 * @openapi
 * /lieux/{id}/restaurer:
 *   post:
 *     summary: Restaurer un lieu désactivé
 *     tags: [Lieux]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lieu restauré (deletedAt=null).
 *       404:
 *         description: Lieu introuvable.
 */
lieuRouter.post(
  "/:id/restaurer",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  restaurerLieu,
);
