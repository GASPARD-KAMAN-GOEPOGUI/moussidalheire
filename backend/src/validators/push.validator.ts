import { z } from "zod";

/**
 * Forme exacte de `PushSubscription.toJSON()` côté navigateur — le frontend
 * peut donc transmettre l'objet tel quel, sans le remodeler.
 *
 * `expirationTime` est accepté puis ignoré : les schémas sont en `.strict()`
 * (voir les autres validateurs), et sans cette clé toute souscription brute
 * serait rejetée alors qu'elle est parfaitement valide.
 */
export const creerAbonnementPushSchema = z
  .object({
    // 500 = la capacité de la colonne (voir PushSubscription.endpoint). Un
    // endpoint plus long serait tronqué en base, donc impossible à retrouver
    // ensuite pour le supprimer.
    endpoint: z.string().trim().url("Endpoint invalide.").max(500),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().trim().min(1).max(255),
        auth: z.string().trim().min(1).max(255),
      })
      .strict(),
  })
  .strict();
export type CreerAbonnementPushInput = z.infer<typeof creerAbonnementPushSchema>;

export const supprimerAbonnementPushSchema = z
  .object({
    endpoint: z.string().trim().url("Endpoint invalide.").max(500),
  })
  .strict();
export type SupprimerAbonnementPushInput = z.infer<typeof supprimerAbonnementPushSchema>;
