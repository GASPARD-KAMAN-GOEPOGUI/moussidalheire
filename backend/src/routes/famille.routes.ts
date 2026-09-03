import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import {
  attachUtilisateurSiPresent,
  requireAuth,
  requireRole,
} from "@/middlewares/auth.middleware";
import {
  creerFamille,
  desactiverFamille,
  listerFamilles,
  listerFamillesRelatives,
  modifierFamille,
  obtenirChaineFamille,
  obtenirFamille,
  restaurerFamille,
} from "@/controllers/famille.controller";
import {
  createFamilleSchema,
  listFamilleQuerySchema,
  updateFamilleSchema,
} from "@/validators/famille.validator";
import { idParamSchema } from "@/validators/common.validator";

/** CRUD générique (voir personne.routes.ts pour le pattern : pas de PATCH,
 * pas de DELETE — desactiver/restaurer à la place), plus la hiérarchie
 * famille relative → famille parente → ... → famille fondatrice via
 * `familleParenteId` (voir famille.service.ts).
 *
 * Lecture (GET) : `attachUtilisateurSiPresent` — jamais bloquant, pour que le
 * formulaire d'auto-inscription (non authentifié) continue de parcourir
 * toutes les familles. Un token valide restreint le résultat à l'univers
 * familial de l'utilisateur (tout son clan), sauf pour un admin qui voit
 * tout — voir `resoudreUniversFamilial`.
 * Écriture (POST/PUT/desactiver/restaurer) : réservée aux admins
 * (`requireAuth` + `requireRole("admin")`) — rien dans le code actuel
 * n'appelle ces routes anonymement (les familles ne sont jamais créées
 * automatiquement par l'inscription). */
export const familleRouter = Router();

/**
 * @openapi
 * /familles:
 *   post:
 *     summary: Créer une famille (générique, sans règle métier)
 *     tags: [Familles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom: { type: string }
 *               description: { type: string }
 *               histoire: { type: string }
 *               devise: { type: string }
 *               imageCouverture: { type: string }
 *               ancetreId: { type: integer, description: "FK vers personnes.id, doit exister" }
 *               familleParenteId: { type: integer, description: "FK vers familles.id, doit exister — famille parente dans la hiérarchie" }
 *     responses:
 *       201:
 *         description: Famille créée.
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: familleParenteId inconnu.
 */
familleRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validate(createFamilleSchema),
  creerFamille,
);

/**
 * @openapi
 * /familles:
 *   get:
 *     summary: Lister les familles (paginé, recherche)
 *     tags: [Familles]
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
 *         description: Recherche sur le nom.
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: >
 *           Liste paginée des familles — publique si aucun token, restreinte à
 *           l'univers familial de l'utilisateur sinon (tout, pour un admin).
 */
familleRouter.get(
  "/",
  attachUtilisateurSiPresent,
  validate(listFamilleQuerySchema, "query"),
  listerFamilles,
);

/**
 * @openapi
 * /familles/{id}:
 *   get:
 *     summary: Obtenir une famille par son identifiant public (uuid)
 *     tags: [Familles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: La famille trouvée.
 *       403:
 *         description: Hors de l'univers familial de l'utilisateur connecté.
 *       404:
 *         description: Famille introuvable.
 */
familleRouter.get(
  "/:id",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  obtenirFamille,
);

/**
 * @openapi
 * /familles/{id}:
 *   put:
 *     summary: Modifier complètement une famille (aucune route PATCH n'existe)
 *     tags: [Familles]
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
 *             required: [nom]
 *     responses:
 *       200:
 *         description: Famille modifiée.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Famille introuvable.
 */
familleRouter.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  validate(updateFamilleSchema),
  modifierFamille,
);

/**
 * @openapi
 * /familles/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) une famille — jamais de suppression physique
 *     tags: [Familles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Famille désactivée (deletedAt renseigné).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Famille introuvable.
 */
familleRouter.post(
  "/:id/desactiver",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  desactiverFamille,
);

/**
 * @openapi
 * /familles/{id}/restaurer:
 *   post:
 *     summary: Restaurer une famille désactivée
 *     tags: [Familles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Famille restaurée (deletedAt=null).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Famille introuvable.
 */
familleRouter.post(
  "/:id/restaurer",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  restaurerFamille,
);

/**
 * @openapi
 * /familles/{id}/relatives:
 *   get:
 *     summary: Lister les familles directement rattachées à celle-ci comme famille parente
 *     tags: [Familles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Familles relatives directes (un seul niveau).
 *       403:
 *         description: Hors de l'univers familial de l'utilisateur connecté.
 *       404:
 *         description: Famille introuvable.
 */
familleRouter.get(
  "/:id/relatives",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  listerFamillesRelatives,
);

/**
 * @openapi
 * /familles/{id}/chaine:
 *   get:
 *     summary: Remonter la chaîne famille relative → famille parente → ... → famille fondatrice
 *     tags: [Familles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Chaîne ordonnée (la famille elle-même en premier, la fondatrice en dernier).
 *       403:
 *         description: Hors de l'univers familial de l'utilisateur connecté.
 *       404:
 *         description: Famille introuvable.
 */
familleRouter.get(
  "/:id/chaine",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  obtenirChaineFamille,
);
