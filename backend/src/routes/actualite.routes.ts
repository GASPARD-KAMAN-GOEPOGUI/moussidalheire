import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { requireAuth, requireRole } from "@/middlewares/auth.middleware";
import {
  creerActualite,
  desactiverActualite,
  listerActualites,
  modifierActualite,
  obtenirActualite,
  restaurerActualite,
} from "@/controllers/actualite.controller";
import {
  createActualiteSchema,
  listActualiteQuerySchema,
  updateActualiteSchema,
} from "@/validators/actualite.validator";
import { idParamSchema } from "@/validators/common.validator";

/** Toute la page Actualités du frontend est derrière `RequireAuth` (aucune
 * consultation anonyme n'existe dans l'app) — donc `requireAuth` sur tout le
 * routeur. Créer une actualité est réservé aux admins (contenu éditorial du
 * village, pas une déclaration communautaire comme une naissance/un
 * mariage) ; modifier reste ouvert à tout membre connecté ; désactiver/
 * restaurer (modération) est réservé aux admins, comme pour `familles`. */
export const actualiteRouter = Router();
actualiteRouter.use(requireAuth);

/**
 * @openapi
 * /actualites:
 *   post:
 *     summary: Créer une actualité (générique, sans règle métier)
 *     tags: [Actualites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [titre, categorieId, resume, contenu]
 *             properties:
 *               titre: { type: string }
 *               categorieId: { type: integer, description: "FK vers categories_actualites.id, doit exister" }
 *               imageCouverture: { type: string }
 *               resume: { type: string }
 *               contenu: { type: string }
 *               auteur: { type: string }
 *               miseEnAvant: { type: boolean }
 *               familleId: { type: integer }
 *     responses:
 *       201:
 *         description: Actualité créée.
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: categorieId inconnu.
 */
actualiteRouter.post("/", requireRole("admin"), validate(createActualiteSchema), creerActualite);

/**
 * @openapi
 * /actualites:
 *   get:
 *     summary: Lister les actualités (paginé, recherche, filtres)
 *     tags: [Actualites]
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
 *         description: Recherche sur le titre.
 *       - in: query
 *         name: categorieId
 *         schema: { type: integer }
 *       - in: query
 *         name: familleId
 *         schema: { type: integer }
 *       - in: query
 *         name: miseEnAvant
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: Liste paginée des actualités.
 */
actualiteRouter.get("/", validate(listActualiteQuerySchema, "query"), listerActualites);

/**
 * @openapi
 * /actualites/{id}:
 *   get:
 *     summary: Obtenir une actualité par son identifiant public (uuid)
 *     tags: [Actualites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: L'actualité trouvée.
 *       404:
 *         description: Actualité introuvable.
 */
actualiteRouter.get("/:id", validate(idParamSchema, "params"), obtenirActualite);

/**
 * @openapi
 * /actualites/{id}:
 *   put:
 *     summary: Modifier complètement une actualité (aucune route PATCH n'existe)
 *     tags: [Actualites]
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
 *             required: [titre, categorieId, resume, contenu]
 *     responses:
 *       200:
 *         description: Actualité modifiée.
 *       401:
 *         description: Authentification requise.
 *       404:
 *         description: Actualité ou categorieId introuvable.
 */
actualiteRouter.put(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateActualiteSchema),
  modifierActualite,
);

/**
 * @openapi
 * /actualites/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) une actualité — jamais de suppression physique
 *     tags: [Actualites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Actualité désactivée (deletedAt renseigné).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Actualité introuvable.
 */
actualiteRouter.post(
  "/:id/desactiver",
  requireRole("admin"),
  validate(idParamSchema, "params"),
  desactiverActualite,
);

/**
 * @openapi
 * /actualites/{id}/restaurer:
 *   post:
 *     summary: Restaurer une actualité désactivée
 *     tags: [Actualites]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Actualité restaurée (deletedAt=null).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Actualité introuvable.
 */
actualiteRouter.post(
  "/:id/restaurer",
  requireRole("admin"),
  validate(idParamSchema, "params"),
  restaurerActualite,
);
