import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { attachUtilisateurSiPresent, requireAuth } from "@/middlewares/auth.middleware";
import {
  creerUnion,
  desactiverUnion,
  listerUnions,
  modifierUnion,
  obtenirUnion,
  restaurerUnion,
} from "@/controllers/union.controller";
import {
  createUnionSchema,
  listUnionQuerySchema,
  updateUnionSchema,
} from "@/validators/union.validator";
import { idParamSchema } from "@/validators/common.validator";

/** Generic CRUD, avec une seule règle métier (epouxId !== epouseId,
 * voir union.service.ts). Lecture publique (`attachUtilisateurSiPresent`,
 * cohérent avec `personnes`/`familles`) ; toute mutation (créer/modifier/
 * désactiver/restaurer) requiert un compte authentifié — tout membre peut
 * déclarer une union depuis une fiche personne, pas seulement un admin. */
export const unionRouter = Router();

/**
 * @openapi
 * /unions:
 *   post:
 *     summary: Créer une union entre deux personnes (générique, sans règle métier)
 *     tags: [Unions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [epouxId, epouseId, statut]
 *             properties:
 *               epouxId: { type: integer }
 *               epouseId: { type: integer }
 *               statut: { type: string, enum: [marie, divorce, veuf, partenaire] }
 *               dateDebut: { type: string, format: date }
 *               dateFin: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Union créée.
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       409:
 *         description: epouxId et epouseId désignent la même personne.
 */
unionRouter.post("/", requireAuth, validate(createUnionSchema), creerUnion);

/**
 * @openapi
 * /unions:
 *   get:
 *     summary: Lister les unions (paginé, filtres)
 *     tags: [Unions]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: personneId
 *         schema: { type: integer }
 *         description: Filtre sur epouxId OU epouseId.
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [marie, divorce, veuf, partenaire] }
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: Liste paginée des unions.
 */
unionRouter.get(
  "/",
  attachUtilisateurSiPresent,
  validate(listUnionQuerySchema, "query"),
  listerUnions,
);

/**
 * @openapi
 * /unions/{id}:
 *   get:
 *     summary: Obtenir une union par son identifiant public (uuid)
 *     tags: [Unions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: L'union trouvée.
 *       404:
 *         description: Union introuvable.
 */
unionRouter.get(
  "/:id",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  obtenirUnion,
);

/**
 * @openapi
 * /unions/{id}:
 *   put:
 *     summary: Modifier complètement une union (aucune route PATCH n'existe)
 *     tags: [Unions]
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
 *             required: [epouxId, epouseId, statut]
 *     responses:
 *       200:
 *         description: Union modifiée.
 *       401:
 *         description: Authentification requise.
 *       404:
 *         description: Union introuvable.
 *       409:
 *         description: epouxId et epouseId désignent la même personne.
 */
unionRouter.put(
  "/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(updateUnionSchema),
  modifierUnion,
);

/**
 * @openapi
 * /unions/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) une union — jamais de suppression physique
 *     tags: [Unions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Union désactivée (deletedAt renseigné).
 *       401:
 *         description: Authentification requise.
 *       404:
 *         description: Union introuvable.
 */
unionRouter.post(
  "/:id/desactiver",
  requireAuth,
  validate(idParamSchema, "params"),
  desactiverUnion,
);

/**
 * @openapi
 * /unions/{id}/restaurer:
 *   post:
 *     summary: Restaurer une union désactivée
 *     tags: [Unions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Union restaurée (deletedAt=null).
 *       401:
 *         description: Authentification requise.
 *       404:
 *         description: Union introuvable.
 */
unionRouter.post("/:id/restaurer", requireAuth, validate(idParamSchema, "params"), restaurerUnion);
