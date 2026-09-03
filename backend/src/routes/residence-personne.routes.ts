import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { attachUtilisateurSiPresent, requireAuth, requireRole } from "@/middlewares/auth.middleware";
import {
  creerResidencePersonne,
  desactiverResidencePersonne,
  listerResidencesPersonnes,
  modifierResidencePersonne,
  obtenirResidencePersonne,
  restaurerResidencePersonne,
} from "@/controllers/residence-personne.controller";
import {
  createResidencePersonneSchema,
  listResidencePersonneQuerySchema,
  updateResidencePersonneSchema,
} from "@/validators/residence-personne.validator";
import { idParamSchema } from "@/validators/common.validator";

/** Réel : `creer`/`modifier` appliquent la règle "au plus une résidence
 * actuelle par personne" (voir residence-personne.service.ts). Lecture (GET) :
 * `attachUtilisateurSiPresent`, comme `personnes`/`lieux`. Créer/modifier :
 * `requireAuth` seul. Désactiver/restaurer : réservé aux administrateurs. */
export const residencePersonneRouter = Router();

/**
 * @openapi
 * /residences-personnes:
 *   post:
 *     summary: Créer une période de résidence (générique, sans règle métier)
 *     tags: [ResidencesPersonnes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [personneId, lieuId]
 *             properties:
 *               personneId: { type: integer }
 *               lieuId: { type: integer }
 *               anneeDebut: { type: integer }
 *               anneeFin: { type: integer }
 *               estActuelle: { type: boolean }
 *     responses:
 *       201:
 *         description: Résidence créée.
 *       400:
 *         description: Erreur de validation.
 */
residencePersonneRouter.post(
  "/",
  requireAuth,
  validate(createResidencePersonneSchema),
  creerResidencePersonne,
);

/**
 * @openapi
 * /residences-personnes:
 *   get:
 *     summary: Lister les résidences (paginé, filtres)
 *     tags: [ResidencesPersonnes]
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
 *       - in: query
 *         name: lieuId
 *         schema: { type: integer }
 *       - in: query
 *         name: estActuelle
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: Liste paginée des résidences.
 */
residencePersonneRouter.get(
  "/",
  attachUtilisateurSiPresent,
  validate(listResidencePersonneQuerySchema, "query"),
  listerResidencesPersonnes,
);

/**
 * @openapi
 * /residences-personnes/{id}:
 *   get:
 *     summary: Obtenir une résidence par son identifiant public (uuid)
 *     tags: [ResidencesPersonnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: La résidence trouvée.
 *       404:
 *         description: Résidence introuvable.
 */
residencePersonneRouter.get(
  "/:id",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  obtenirResidencePersonne,
);

/**
 * @openapi
 * /residences-personnes/{id}:
 *   put:
 *     summary: Modifier complètement une résidence (aucune route PATCH n'existe)
 *     tags: [ResidencesPersonnes]
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
 *             required: [personneId, lieuId]
 *     responses:
 *       200:
 *         description: Résidence modifiée.
 *       404:
 *         description: Résidence introuvable.
 */
residencePersonneRouter.put(
  "/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(updateResidencePersonneSchema),
  modifierResidencePersonne,
);

/**
 * @openapi
 * /residences-personnes/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) une résidence — jamais de suppression physique
 *     tags: [ResidencesPersonnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Résidence désactivée (deletedAt renseigné).
 *       404:
 *         description: Résidence introuvable.
 */
residencePersonneRouter.post(
  "/:id/desactiver",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  desactiverResidencePersonne,
);

/**
 * @openapi
 * /residences-personnes/{id}/restaurer:
 *   post:
 *     summary: Restaurer une résidence désactivée
 *     tags: [ResidencesPersonnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Résidence restaurée (deletedAt=null).
 *       404:
 *         description: Résidence introuvable.
 */
residencePersonneRouter.post(
  "/:id/restaurer",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  restaurerResidencePersonne,
);
