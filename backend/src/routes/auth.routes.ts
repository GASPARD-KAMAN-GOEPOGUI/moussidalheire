import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "@/middlewares/validate.middleware";
import { requireAuth } from "@/middlewares/auth.middleware";
import {
  changerMotDePasse,
  connexion,
  inscription,
  moi,
  motDePasseOublie,
  rafraichir,
  reinitialiserMotDePasse,
  verifierCode,
} from "@/controllers/auth.controller";
import {
  changerMotDePasseSchema,
  connexionSchema,
  inscriptionSchema,
  motDePasseOublieSchema,
  rafraichirSchema,
  reinitialiserMotDePasseSchema,
  verifierCodeSchema,
} from "@/validators/auth.validator";

/**
 * MODULE — auth. Creates a `Personne` + linked `Utilisateur` together
 * (inscription), verifies credentials (connexion), exposes the current
 * authenticated utilisateur (moi) for frontend session rehydration, lets the
 * frontend silently renew an expired access token (refresh) without
 * involving the mot de passe again, and lets the currently authenticated
 * utilisateur change their own mot de passe. No logout route: JWTs are
 * stateless — logout is purely a client-side "forget the tokens".
 *
 * Seule exception à cette absence d'invalidation côté serveur : la
 * réinitialisation du mot de passe par code e-mail (mot-de-passe-oublie,
 * verifier-code, reinitialiser-mot-de-passe), qui révoque d'un coup toutes
 * les sessions ouvertes du compte — voir jwt.ts::jetonRevoque.
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
 * Limiteurs de la réinitialisation par code, plus stricts que /connexion.
 *
 * La demande de code est la cible la plus exposée : chaque appel déclenche un
 * vrai e-mail, et l'endpoint pourrait servir à inonder une boîte de messages.
 * Trois par quart d'heure laissent une demande initiale et deux renvois.
 * La vérification tolère plus d'essais par IP, le plafond réel étant de cinq
 * essais par code (voir password-reset.service.ts). La réinitialisation n'est
 * appelée qu'une fois par procédure réussie.
 */
const MESSAGE_TROP_DE_DEMANDES = {
  success: false,
  message: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
  error: { code: "TOO_MANY_REQUESTS" },
};

function limiteur(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: MESSAGE_TROP_DE_DEMANDES,
  });
}

const demandeCodeLimiter = limiteur(3);
const verifierCodeLimiter = limiteur(10);
const reinitialisationLimiter = limiteur(5);

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

/**
 * @openapi
 * /auth/mot-de-passe-oublie:
 *   post:
 *     summary: Demande un code de réinitialisation par e-mail (réponse identique que le compte existe ou non)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifiant]
 *             properties:
 *               identifiant: { type: string, description: "Identifiant, e-mail, matricule ou numéro de téléphone — comme à la connexion." }
 *     responses:
 *       200:
 *         description: Réponse neutre — un code a peut-être été envoyé. Les codes précédents du compte sont invalidés.
 *       400:
 *         description: Erreur de validation.
 *       429:
 *         description: Trop de demandes (3 par quart d'heure et par IP).
 */
authRouter.post(
  "/mot-de-passe-oublie",
  demandeCodeLimiter,
  validate(motDePasseOublieSchema),
  motDePasseOublie,
);

/**
 * @openapi
 * /auth/verifier-code:
 *   post:
 *     summary: Vérifie un code de réinitialisation et renvoie un jeton temporaire (10 minutes)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifiant, code]
 *             properties:
 *               identifiant: { type: string }
 *               code: { type: string, description: "6 caractères, majuscules et chiffres. Espaces et tirets ignorés." }
 *     responses:
 *       200:
 *         description: Code valide — `jeton` à présenter à /auth/reinitialiser-mot-de-passe.
 *       400:
 *         description: Code invalide ou expiré (même message dans tous les cas d'échec). Invalidé après 5 essais.
 *       429:
 *         description: Trop de tentatives (10 par quart d'heure et par IP).
 */
authRouter.post("/verifier-code", verifierCodeLimiter, validate(verifierCodeSchema), verifierCode);

/**
 * @openapi
 * /auth/reinitialiser-mot-de-passe:
 *   post:
 *     summary: Définit le nouveau mot de passe et ferme toutes les sessions ouvertes du compte
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jeton, nouveauMotDePasse]
 *             properties:
 *               jeton: { type: string, description: "Jeton renvoyé par /auth/verifier-code." }
 *               nouveauMotDePasse: { type: string, format: password, minLength: 8 }
 *     responses:
 *       200:
 *         description: Mot de passe réinitialisé ; tous les jetons émis auparavant sont révoqués.
 *       400:
 *         description: Jeton expiré ou déjà utilisé, ou mot de passe trop faible.
 *       429:
 *         description: Trop de tentatives (5 par quart d'heure et par IP).
 */
authRouter.post(
  "/reinitialiser-mot-de-passe",
  reinitialisationLimiter,
  validate(reinitialiserMotDePasseSchema),
  reinitialiserMotDePasse,
);
