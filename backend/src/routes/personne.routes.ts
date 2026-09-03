import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import {
  attachUtilisateurSiPresent,
  requireAuth,
  requireRole,
} from "@/middlewares/auth.middleware";
import {
  ajouterConjointAuConnecte,
  ajouterEnfantAuConnecte,
  creerPersonne,
  desactiverPersonne,
  listerConjointsPersonne,
  listerEnfantsPersonne,
  listerFratriePersonne,
  listerPersonnes,
  modifierPersonne,
  obtenirPersonne,
  restaurerPersonne,
} from "@/controllers/personne.controller";
import {
  ajouterConjointSchema,
  ajouterEnfantSchema,
  createPersonneSchema,
  listPersonneQuerySchema,
  updatePersonneSchema,
} from "@/validators/personne.validator";
import { idParamSchema } from "@/validators/common.validator";

/**
 * MODULE — personnes (complet : vraies règles métier, voir personne.service.ts).
 * No PATCH route (PUT handles full updates); no DELETE route (desactiver/
 * restaurer instead, matching the never-physically-delete rule).
 *
 * Lecture (GET) : `attachUtilisateurSiPresent` — jamais bloquant, cohérent
 * avec `famille.routes.ts` (recherche publique). Créer/modifier une fiche :
 * `requireAuth` seul — tout membre connecté peut enrichir le recensement.
 * Désactiver/restaurer : `requireAuth` + `requireRole("admin")` — retirer
 * quelqu'un du recensement actif est plus sensible qu'une simple édition.
 */
export const personneRouter = Router();

/**
 * @openapi
 * /personnes:
 *   post:
 *     summary: Créer une personne (matricule et génération calculés côté serveur)
 *     tags: [Personnes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prenom, nom, sexe, familleId]
 *             properties:
 *               prenom: { type: string }
 *               nom: { type: string }
 *               surnom: { type: string }
 *               sexe: { type: string, enum: [homme, femme] }
 *               photo: { type: string }
 *               dateNaissance: { type: string, format: date }
 *               lieuNaissance: { type: string }
 *               estDecede: { type: boolean, default: false }
 *               statutMatrimonial: { type: string, enum: [celibataire, marie, divorce, veuf] }
 *               profession: { type: string }
 *               niveauEtudes: { type: string }
 *               bio: { type: string }
 *               telephone: { type: string }
 *               email: { type: string }
 *               whatsapp: { type: string }
 *               visibiliteContacts: { type: string, enum: [public, membres, prive] }
 *               visibiliteProfil: { type: string, enum: [public, membres, prive] }
 *               brancheId: { type: integer, description: "Doit référencer une branche existante." }
 *               familleId: { type: integer, description: "Doit référencer une famille existante." }
 *               pereId: { type: integer, description: "Doit référencer une personne existante." }
 *               mereId: { type: integer, description: "Doit référencer une personne existante." }
 *               forcerCreation:
 *                 type: boolean
 *                 default: false
 *                 description: Ignore la détection de doublon (même prénom/nom/date de naissance).
 *     responses:
 *       201:
 *         description: Personne créée (matricule et génération assignés automatiquement).
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       404:
 *         description: Famille, branche, père ou mère introuvable.
 *       409:
 *         description: Doublon détecté (sans forcerCreation=true).
 */
personneRouter.post("/", requireAuth, validate(createPersonneSchema), creerPersonne);

/**
 * @openapi
 * /personnes/moi/enfants:
 *   post:
 *     summary: Ajouter un enfant à l'utilisateur connecté (espace personnel) — le parent est toujours l'utilisateur authentifié, jamais un pereId fourni par le client
 *     tags: [Personnes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prenom, sexe]
 *             properties:
 *               prenom: { type: string }
 *               sexe: { type: string, enum: [homme, femme] }
 *               photo: { type: string }
 *               dateNaissance: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Enfant créé — personne réelle + compte utilisateur (matricule, identifiant, mot de passe temporaire).
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Le compte connecté n'est associé à aucune fiche personne.
 */
personneRouter.post(
  "/moi/enfants",
  requireAuth,
  validate(ajouterEnfantSchema),
  ajouterEnfantAuConnecte,
);

/**
 * @openapi
 * /personnes/moi/conjoint:
 *   post:
 *     summary: Ajouter un·e conjoint·e à l'utilisateur connecté (espace personnel) — crée la personne, son compte, et l'union (statut marie) avec l'utilisateur authentifié
 *     tags: [Personnes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prenom, nom]
 *             properties:
 *               prenom: { type: string }
 *               nom: { type: string }
 *               photo: { type: string }
 *               telephone: { type: string }
 *     responses:
 *       201:
 *         description: Conjoint·e créé·e — personne réelle + compte utilisateur + union (matricule, identifiant, mot de passe temporaire).
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Le compte connecté n'est associé à aucune fiche personne.
 */
personneRouter.post(
  "/moi/conjoint",
  requireAuth,
  validate(ajouterConjointSchema),
  ajouterConjointAuConnecte,
);

/**
 * @openapi
 * /personnes:
 *   get:
 *     summary: Lister les personnes (paginé, recherche, filtres)
 *     tags: [Personnes]
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
 *         description: Recherche sur prénom/nom/profession.
 *       - in: query
 *         name: actif
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: familleId
 *         schema: { type: integer }
 *       - in: query
 *         name: inclureSupprimes
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: profession
 *         schema: { type: string }
 *         description: Filtre exact (pas de recherche partielle).
 *       - in: query
 *         name: estDecede
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: trierPar
 *         schema: { type: string, enum: [nom, recent, generation] }
 *         description: "Défaut : recent (createdAt desc)."
 *     responses:
 *       200:
 *         description: Liste paginée des personnes.
 */
personneRouter.get(
  "/",
  attachUtilisateurSiPresent,
  validate(listPersonneQuerySchema, "query"),
  listerPersonnes,
);

/**
 * @openapi
 * /personnes/{id}:
 *   get:
 *     summary: Obtenir une personne par son identifiant public (uuid)
 *     tags: [Personnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: La personne trouvée.
 *       404:
 *         description: Personne introuvable.
 */
personneRouter.get(
  "/:id",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  obtenirPersonne,
);

/**
 * @openapi
 * /personnes/{id}/enfants:
 *   get:
 *     summary: Lister les enfants de cette personne (dérivé de pereId/mereId, jamais stocké)
 *     tags: [Personnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Les enfants de cette personne.
 *       404:
 *         description: Personne introuvable.
 */
personneRouter.get(
  "/:id/enfants",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  listerEnfantsPersonne,
);

/**
 * @openapi
 * /personnes/{id}/fratrie:
 *   get:
 *     summary: Lister la fratrie de cette personne (même père ou même mère, jamais stocké)
 *     tags: [Personnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: La fratrie de cette personne.
 *       404:
 *         description: Personne introuvable.
 */
personneRouter.get(
  "/:id/fratrie",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  listerFratriePersonne,
);

/**
 * @openapi
 * /personnes/{id}/conjoints:
 *   get:
 *     summary: Lister les conjoint·e·s de cette personne (dérivé de la table unions, lecture seule)
 *     tags: [Personnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Les conjoint·e·s de cette personne.
 *       404:
 *         description: Personne introuvable.
 */
personneRouter.get(
  "/:id/conjoints",
  attachUtilisateurSiPresent,
  validate(idParamSchema, "params"),
  listerConjointsPersonne,
);

/**
 * @openapi
 * /personnes/{id}:
 *   put:
 *     summary: Modifier complètement une personne (aucune route PATCH n'existe)
 *     tags: [Personnes]
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
 *             required: [prenom, nom, sexe, familleId]
 *             description: Même forme que la création, sans forcerCreation. matricule reste inchangé ; generation est recalculée si pereId/mereId change.
 *     responses:
 *       200:
 *         description: Personne modifiée.
 *       401:
 *         description: Authentification requise.
 *       404:
 *         description: Personne, famille, branche, père ou mère introuvable.
 *       409:
 *         description: Le nouveau père/mère créerait une boucle généalogique.
 */
personneRouter.put(
  "/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(updatePersonneSchema),
  modifierPersonne,
);

/**
 * @openapi
 * /personnes/{id}/desactiver:
 *   post:
 *     summary: Désactiver (suppression logique) une personne — jamais de suppression physique
 *     tags: [Personnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Personne désactivée (deletedAt renseigné).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Personne introuvable.
 */
personneRouter.post(
  "/:id/desactiver",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  desactiverPersonne,
);

/**
 * @openapi
 * /personnes/{id}/restaurer:
 *   post:
 *     summary: Restaurer une personne désactivée
 *     tags: [Personnes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Personne restaurée (deletedAt=null).
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Réservé aux administrateurs.
 *       404:
 *         description: Personne introuvable.
 */
personneRouter.post(
  "/:id/restaurer",
  requireAuth,
  requireRole("admin"),
  validate(idParamSchema, "params"),
  restaurerPersonne,
);
