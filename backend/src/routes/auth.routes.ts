import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "@/middlewares/validate.middleware";
import { requireAuth } from "@/middlewares/auth.middleware";
import {
  changerMotDePasse,
  connexion,
  inscription,
  moi,
  rafraichir,
} from "@/controllers/auth.controller";
import {
  changerMotDePasseSchema,
  connexionSchema,
  inscriptionSchema,
  rafraichirSchema,
} from "@/validators/auth.validator";

/**
 * MODULE — auth. Creates a `Personne` + linked `Utilisateur` together
 * (inscription), verifies credentials (connexion), exposes the current
 * authenticated utilisateur (moi) for frontend session rehydration, lets the
 * frontend silently renew an expired access token (refresh) without
 * involving the mot de passe again, and lets the currently authenticated
 * utilisateur change their own mot de passe. No logout route: JWTs are
 * stateless — logout is purely a client-side "forget the tokens", nothing to
 * invalidate server-side.
 */
export const authRouter = Router();

/** Separate from the general `/api` limiter in app.ts (1000/15min, shared by
 * every route) — /connexion is the one endpoint where a tight per-IP budget
 * actually matters, since it's the password-guessing target. Kept low
 * regardless of how generous the general limiter is. */
const connexionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @openapi
 * /auth/inscription:
 *   post:
 *     summary: Auto-inscription — crée une personne ET son compte utilisateur, avec en option son père, sa mère, sa fratrie et ses conjoint(s), retourne un token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prenom, nom, sexe, email, familleId]
 *             properties:
 *               prenom: { type: string }
 *               nom: { type: string }
 *               sexe: { type: string, enum: [homme, femme] }
 *               email: { type: string, format: email, description: "Devient l'identifiant de connexion ; reçoit le mot de passe initial." }
 *               telephone: { type: string }
 *               dateNaissance: { type: string, format: date }
 *               lieuNaissance: { type: string }
 *               statutMatrimonial: { type: string, enum: [celibataire, marie, divorce, veuf] }
 *               profession: { type: string }
 *               familleId: { type: integer }
 *               pere:
 *                 description: "Sélection d'une personne existante ({mode:'existant', id}) ou création à la volée ({mode:'nouveau', donnees:{...}}) — doit être de sexe masculin."
 *                 oneOf:
 *                   - type: object
 *                     required: [mode, id]
 *                     properties: { mode: { type: string, enum: [existant] }, id: { type: integer } }
 *                   - type: object
 *                     required: [mode, donnees]
 *                     properties: { mode: { type: string, enum: [nouveau] }, donnees: { type: object } }
 *               mere:
 *                 description: "Même structure que `pere` — doit être de sexe féminin."
 *               fratrie:
 *                 type: array
 *                 maxItems: 20
 *                 description: "Frères/sœurs — mêmes entrées que `pere`/`mere`. Une entrée existante n'est pas re-rattachée aux parents choisis ici."
 *                 items: { type: object }
 *               conjoints:
 *                 type: array
 *                 maxItems: 10
 *                 description: "Conjoint(s) — vide si statutMatrimonial=celibataire (ou absent). Une Union distincte est créée par conjoint, avec le statut = statutMatrimonial."
 *                 items: { type: object }
 *               forcerCreation: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: >
 *           Compte créé — utilisateur immédiatement authentifié (token retourné, mot de passe envoyé par e-mail).
 *           La réponse inclut aussi `motDePasseTemporaire`, et, si fournis, `pere`/`mere`/`fratrie`/`conjoints`/`fratrieMeresCreees`
 *           (chacun avec id, uuid, matricule, prenom, nom, sexe, `cree: boolean`; les conjoints ont en plus `unionUuid`/`statutUnion`).
 *           Toute personne avec `cree: true` reçoit aussi son propre compte, exposé dans `compte: { identifiant, motDePasseTemporaire }`
 *           (identifiant = son e-mail si elle en a un, sinon son matricule) — jamais présent pour une personne déjà existante.
 *       400:
 *         description: Erreur de validation.
 *       404:
 *         description: Famille, père, mère, frère/sœur ou conjoint (référencé par id) introuvable.
 *       409:
 *         description: E-mail déjà utilisé, sexe incohérent pour père/mère, ou doublon détecté (sans forcerCreation=true).
 */
authRouter.post("/inscription", validate(inscriptionSchema), inscription);

/**
 * @openapi
 * /auth/connexion:
 *   post:
 *     summary: Connexion — vérifie identifiant + mot de passe, retourne un token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifiant, motDePasse]
 *             properties:
 *               identifiant: { type: string, description: "Identifiant, e-mail, matricule ou numéro de téléphone — tous les quatre sont acceptés." }
 *               motDePasse: { type: string }
 *     responses:
 *       200:
 *         description: Connexion réussie.
 *       401:
 *         description: Identifiant/mot de passe incorrect, ou compte désactivé.
 */
authRouter.post("/connexion", connexionLimiter, validate(connexionSchema), connexion);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Échange un jeton de rafraîchissement valide contre un nouveau jeton d'accès (et un nouveau jeton de rafraîchissement)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Nouveaux jetons émis.
 *       401:
 *         description: Jeton de rafraîchissement manquant, invalide, expiré, ou compte désactivé.
 */
authRouter.post("/refresh", validate(rafraichirSchema), rafraichir);

/**
 * @openapi
 * /auth/moi:
 *   get:
 *     summary: Utilisateur actuellement authentifié (depuis le token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: L'utilisateur courant.
 *       401:
 *         description: Authentification requise, token invalide/expiré, ou compte désactivé.
 */
authRouter.get("/moi", requireAuth, moi);

/**
 * @openapi
 * /auth/mot-de-passe:
 *   post:
 *     summary: Change le mot de passe de l'utilisateur actuellement authentifié (aucune vérification de l'ancien mot de passe — le jeton seul autorise le changement)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nouveauMotDePasse]
 *             properties:
 *               nouveauMotDePasse: { type: string, format: password, minLength: 8 }
 *     responses:
 *       200:
 *         description: Mot de passe mis à jour.
 *       400:
 *         description: Erreur de validation (nouveau mot de passe trop faible).
 *       401:
 *         description: Authentification requise.
 *       409:
 *         description: Le nouveau mot de passe est identique à l'actuel.
 */
authRouter.post("/mot-de-passe", requireAuth, validate(changerMotDePasseSchema), changerMotDePasse);
