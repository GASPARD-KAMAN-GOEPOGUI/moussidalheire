import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/middlewares/auth.middleware";
import {
  creerUtilisateur,
  desactiverUtilisateur,
  listerUtilisateurs,
  modifierUtilisateur,
  obtenirUtilisateur,
  reactiverUtilisateur,
} from "@/controllers/utilisateurs.controller";
import { createUtilisateurSchema } from "@/schemas/utilisateurs/create-utilisateur.schema";
import { updateUtilisateurSchema } from "@/schemas/utilisateurs/update-utilisateur.schema";
import { listUtilisateursQuerySchema } from "@/schemas/utilisateurs/list-utilisateurs.schema";
import { uuidParamSchema } from "@/schemas/utilisateurs/utilisateur.primitives";

/**
 * MODULE 01 — utilisateurs (CRUD backend, gestion de comptes).
 *
 * No PATCH route (PUT handles full updates) and no DELETE route (lifecycle changes
 * go through POST /:id/desactiver and /:id/reactiver — this table never loses a
 * row through the API). Any request to a method/path this router doesn't define
 * falls through to the app's 404 handler, exactly like any other unknown route.
 *
 * Toutes les routes, lecture incluse, sont réservées aux administrateurs
 * (`requireAuth` + `requireRole("admin")`) — ce module gère des comptes de
 * connexion (identifiant, e-mail), pas des données de recensement publiques ;
 * contrairement à `personnes`/`familles`/`branches`/`unions`, aucune lecture
 * n'est ouverte. La création d'un compte lors de l'auto-inscription passe par
 * `POST /auth/inscription`, jamais par ce routeur.
 */
export const utilisateursRouter = Router();

/**
 * @openapi
 * /utilisateurs:
 *   post:
 *     summary: Créer un utilisateur
 *     tags: [Utilisateurs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifiant, motDePasse]
 *             properties:
 *               identifiant:
 *                 type: string
 *                 example: amadou.diallo
 *               email:
 *                 type: string
 *                 format: email
 *               motDePasse:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               personneId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Utilisateur créé. Le mot de passe / son hash ne sont jamais renvoyés.
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       409:
 *         description: Identifiant ou e-mail déjà utilisé.
 */
utilisateursRouter.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validate(createUtilisateurSchema),
  creerUtilisateur,
);

/**
 * @openapi
 * /utilisateurs:
 *   get:
 *     summary: Lister les utilisateurs (paginé, recherche, filtres)
 *     tags: [Utilisateurs]
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
 *         description: Recherche sur identifiant/email.
 *       - in: query
 *         name: actif
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *         description: Par défaut, les utilisateurs supprimés logiquement sont exclus.
 *     responses:
 *       200:
 *         description: Liste paginée des utilisateurs.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 */
utilisateursRouter.get(
  "/",
  requireAuth,
  requireRole("admin"),
  validate(listUtilisateursQuerySchema, "query"),
  listerUtilisateurs,
);

/**
 * @openapi
 * /utilisateurs/{id}:
 *   get:
 *     summary: Obtenir un utilisateur par son identifiant public (uuid)
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: L'utilisateur trouvé.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Utilisateur introuvable.
 */
utilisateursRouter.get(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validate(uuidParamSchema, "params"),
  obtenirUtilisateur,
);

/**
 * @openapi
 * /utilisateurs/{id}:
 *   put:
 *     summary: Modifier complètement un utilisateur (aucune route PATCH n'existe)
 *     tags: [Utilisateurs]
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
 *             required: [identifiant]
 *             properties:
 *               identifiant: { type: string }
 *               email: { type: string, format: email }
 *               motDePasse: { type: string, format: password, minLength: 8, description: "Omis = mot de passe inchangé." }
 *               personneId: { type: integer }
 *     responses:
 *       200:
 *         description: Utilisateur modifié.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Utilisateur introuvable.
 *       409:
 *         description: Identifiant/e-mail déjà utilisé, ou compte désactivé (réactiver avant de modifier).
 */
utilisateursRouter.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validate(uuidParamSchema, "params"),
  validate(updateUtilisateurSchema),
  modifierUtilisateur,
);

/**
 * @openapi
 * /utilisateurs/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) un utilisateur — jamais de suppression physique
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Utilisateur désactivé (actif=false, supprime=true, supprimeLe renseigné).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Utilisateur introuvable.
 *       409:
 *         description: Utilisateur déjà désactivé.
 */
utilisateursRouter.post(
  "/:id/desactiver",
  requireAuth,
  requireRole("admin"),
  validate(uuidParamSchema, "params"),
  desactiverUtilisateur,
);

/**
 * @openapi
 * /utilisateurs/{id}/reactiver:
 *   post:
 *     summary: Réactiver un utilisateur désactivé — restaure la ligne existante, n'en recrée jamais une nouvelle
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Utilisateur réactivé (actif=true, supprime=false, supprimeLe=null).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Utilisateur introuvable.
 *       409:
 *         description: Utilisateur déjà actif.
 */
utilisateursRouter.post(
  "/:id/reactiver",
  requireAuth,
  requireRole("admin"),
  validate(uuidParamSchema, "params"),
  reactiverUtilisateur,
);
