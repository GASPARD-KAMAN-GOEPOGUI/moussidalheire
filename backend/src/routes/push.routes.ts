import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { requireAuth } from "@/middlewares/auth.middleware";
import {
  enregistrerAbonnementPush,
  obtenirClePubliquePush,
  supprimerAbonnementPush,
} from "@/controllers/push.controller";
import {
  creerAbonnementPushSchema,
  supprimerAbonnementPushSchema,
} from "@/validators/push.validator";

/**
 * Notifications Web Push.
 *
 * Aucune restriction de rôle : s'abonner aux notifications est un geste
 * individuel, pas une action d'administration. En revanche l'abonnement est
 * rattaché au compte connecté, d'où `requireAuth` sur les deux routes
 * d'écriture.
 */
export const pushRouter = Router();

/**
 * @openapi
 * /push/cle-publique:
 *   get:
 *     summary: Obtenir la clé publique VAPID nécessaire à l'abonnement
 *     tags: [Push]
 *     responses:
 *       200:
 *         description: La clé publique VAPID.
 */
// Volontairement hors `requireAuth` : cette clé est publique par construction
// (le navigateur la transmet au service push), et la servir ici évite au
// frontend d'embarquer une VITE_VAPID_PUBLIC_KEY par environnement — donc
// évite qu'elle diverge un jour de celle qui signe les envois.
pushRouter.get("/cle-publique", obtenirClePubliquePush);

pushRouter.use(requireAuth);

/**
 * @openapi
 * /push/abonnements:
 *   post:
 *     summary: Enregistrer l'abonnement push de l'appareil courant
 *     description: >
 *       Accepte tel quel l'objet renvoyé par `PushSubscription.toJSON()`.
 *       Idempotent : réémettre le même endpoint met à jour l'abonnement
 *       existant au lieu d'en créer un second.
 *     tags: [Push]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint, keys]
 *             properties:
 *               endpoint: { type: string, format: uri }
 *               expirationTime: { type: number, nullable: true }
 *               keys:
 *                 type: object
 *                 required: [p256dh, auth]
 *                 properties:
 *                   p256dh: { type: string }
 *                   auth: { type: string }
 *     responses:
 *       201:
 *         description: Abonnement enregistré.
 *       400:
 *         description: Erreur de validation.
 *       401:
 *         description: Authentification requise.
 */
pushRouter.post("/abonnements", validate(creerAbonnementPushSchema), enregistrerAbonnementPush);

/**
 * @openapi
 * /push/abonnements:
 *   delete:
 *     summary: Supprimer l'abonnement push de l'appareil courant
 *     tags: [Push]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint]
 *             properties:
 *               endpoint: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Abonnement supprimé.
 *       401:
 *         description: Authentification requise.
 *       404:
 *         description: Aucun abonnement ne correspond à cet appareil.
 */
pushRouter.delete("/abonnements", validate(supprimerAbonnementPushSchema), supprimerAbonnementPush);
