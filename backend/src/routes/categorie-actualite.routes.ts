import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/middlewares/auth.middleware";
import {
  creerCategorieActualite,
  desactiverCategorieActualite,
  listerCategoriesActualites,
  modifierCategorieActualite,
  obtenirCategorieActualite,
  restaurerCategorieActualite,
} from "@/controllers/categorie-actualite.controller";
import {
  createCategorieActualiteSchema,
  listCategorieActualiteQuerySchema,
  updateCategorieActualiteSchema,
} from "@/validators/categorie-actualite.validator";
import { idParamSchema } from "@/validators/common.validator";

/** Rattaché à `Actualite.categorieId` (voir schema.prisma). Lecture (GET) :
 * `requireAuth` seul — tout membre connecté doit pouvoir lister les
 * catégories disponibles (filtre de la page Actualités, sélecteur du
 * formulaire de publication). Écriture (POST/PUT/desactiver/restaurer) :
 * réservée aux admins (`requireAuth` + `requireRole("admin")`), comme pour
 * `familles` — une catégorie est une donnée structurelle, pas un contenu
 * publié par un membre. */
export const categorieActualiteRouter = Router();
categorieActualiteRouter.use(requireAuth);

/**
 * @openapi
 * /categories-actualites:
 *   post:
 *     summary: Créer une catégorie d'actualité (générique, sans règle métier)
 *     tags: [CategoriesActualites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, slug]
 *             properties:
 *               nom: { type: string }
 *               slug: { type: string, description: "Minuscules, chiffres et tirets uniquement." }
 *               description: { type: string }
 *               statut: { type: string }
 *     responses:
 *       201:
 *         description: Catégorie créée.
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       409:
 *         description: Ce nom ou ce slug est déjà utilisé.
 */
categorieActualiteRouter.post(
  "/",
  requireRole("admin"),
  validate(createCategorieActualiteSchema),
  creerCategorieActualite,
);

/**
 * @openapi
 * /categories-actualites:
 *   get:
 *     summary: Lister les catégories d'actualités (paginé, recherche)
 *     tags: [CategoriesActualites]
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
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: Liste paginée des catégories.
 */
categorieActualiteRouter.get(
  "/",
  validate(listCategorieActualiteQuerySchema, "query"),
  listerCategoriesActualites,
);

/**
 * @openapi
 * /categories-actualites/{id}:
 *   get:
 *     summary: Obtenir une catégorie d'actualité par son identifiant public (uuid)
 *     tags: [CategoriesActualites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: La catégorie trouvée.
 *       404:
 *         description: Catégorie introuvable.
 */
categorieActualiteRouter.get("/:id", validate(idParamSchema, "params"), obtenirCategorieActualite);

/**
 * @openapi
 * /categories-actualites/{id}:
 *   put:
 *     summary: Modifier complètement une catégorie d'actualité (aucune route PATCH n'existe)
 *     tags: [CategoriesActualites]
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
 *             required: [nom, slug]
 *     responses:
 *       200:
 *         description: Catégorie modifiée.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Catégorie introuvable.
 */
categorieActualiteRouter.put(
  "/:id",
  requireRole("admin"),
  validate(idParamSchema, "params"),
  validate(updateCategorieActualiteSchema),
  modifierCategorieActualite,
);

/**
 * @openapi
 * /categories-actualites/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) une catégorie — jamais de suppression physique
 *     tags: [CategoriesActualites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Catégorie désactivée (deletedAt renseigné).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Catégorie introuvable.
 */
categorieActualiteRouter.post(
  "/:id/desactiver",
  requireRole("admin"),
  validate(idParamSchema, "params"),
  desactiverCategorieActualite,
);

/**
 * @openapi
 * /categories-actualites/{id}/restaurer:
 *   post:
 *     summary: Restaurer une catégorie désactivée
 *     tags: [CategoriesActualites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Catégorie restaurée (deletedAt=null).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Catégorie introuvable.
 */
categorieActualiteRouter.post(
  "/:id/restaurer",
  requireRole("admin"),
  validate(idParamSchema, "params"),
  restaurerCategorieActualite,
);
