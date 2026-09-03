import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import {
  booleanQueryParamSchema,
  sexeSchema,
  statutMatrimonialSchema,
  visibiliteSchema,
} from "./common.validator";
import { versMajusculesSansAccent } from "@/utils/text";

/**
 * Un numéro de téléphone n'est fait que de chiffres, éventuellement précédés
 * d'un « + » — jamais de lettres, d'espaces ni d'aucun autre caractère
 * spécial. Le frontend filtre déjà la frappe (voir
 * `components/shared/PhoneInput.tsx`), mais un client peut poster ce qu'il
 * veut à l'API : la règle est donc réaffirmée ici, seul endroit qui fasse
 * autorité. La valeur acceptée est stockée telle quelle, sans indicatif
 * ajouté ni reformatage — c'est exactement ce que la personne a saisi.
 *
 * Le plancher de 6 chiffres reprend celui du frontend (`PHONE_RE` dans
 * `lib/utils.ts`) : assez bas pour n'écarter aucun numéro réel, assez haut
 * pour rejeter une saisie manifestement tronquée. La borne de 30 caractères
 * suit `personnes.telephone @db.VarChar(30)`.
 */
export const telephoneSchema = z
  .union([
    // Champ vidé côté client : « pas de numéro », pas un numéro invalide —
    // même traitement que `optionalEmailSchema`, qui assimile déjà "" à une
    // valeur absente.
    z.literal(""),
    z
      .string()
      .trim()
      .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères.")
      .regex(
        /^\+?\d{6,}$/,
        "Le numéro de téléphone ne peut contenir que des chiffres, éventuellement précédés de « + ».",
      ),
  ])
  .optional()
  .transform((valeur) => (valeur ? valeur : undefined))
  // Rétablit l'optionalité du type produit : `.transform()` après
  // `.optional()` rendrait la clé obligatoire côté TypeScript, avec le type
  // `string | undefined`. Même construction, pour la même raison, que
  // `optionalEmailSchema` (voir `schemas/utilisateurs/utilisateur.primitives.ts`).
  .pipe(z.string().max(30).optional());

/**
 * Structural validation only (types, lengths, required-ness). Business rules
 * (duplicate detection, cycle detection on pereId/mereId, matricule
 * generation, generation calculation) live in personne.service.ts.
 *
 * `matricule` et `generation` sont volontairement JAMAIS acceptés depuis le
 * client à la création — tous deux calculés côté serveur (voir
 * personne.service.ts) — et `.strict()` les rejette explicitement plutôt que
 * de les ignorer silencieusement.
 */
export const personneFieldsSchema = {
  prenom: z.string().trim().min(1).max(100),
  /** Toujours stocké en MAJUSCULES SANS ACCENT (ex. "Goépogui"/"goepogui" →
   * "GOEPOGUI"), quel que soit ce que le client envoie — même normalisation
   * que `Famille.nom` (voir `famille.validator.ts` et `utils/text.ts`), pour
   * que le frontend n'ait jamais à faire confiance à un client qui bypasserait
   * sa propre saisie normalisée (voir aussi `inscriptionSchema` dans
   * `auth.validator.ts`, qui redéfinit `nom` séparément pour le même motif). */
  nom: z.string().trim().min(1).max(100).transform(versMajusculesSansAccent),
  surnom: z.string().trim().max(100).optional(),
  sexe: sexeSchema,
  photo: z.string().trim().max(500).optional(),
  dateNaissance: z.coerce.date().optional(),
  lieuNaissance: z.string().trim().max(150).optional(),
  estDecede: z.boolean().optional(),
  statutMatrimonial: statutMatrimonialSchema.optional(),
  profession: z.string().trim().max(150).optional(),
  niveauEtudes: z.string().trim().max(100).optional(),
  bio: z.string().trim().optional(),
  /** Situation géographique simplifiée (deux booléens, jamais une table
   * géographique) — non pertinente pour une personne décédée, mais toujours
   * une vraie colonne booléenne. `estAuVillage: true` force toujours
   * `estEnGuinee: true` à l'écriture, voir
   * personne.service.ts::normaliserSituationGeographique. */
  estAuVillage: z.boolean().optional(),
  estEnGuinee: z.boolean().optional(),
  telephone: telephoneSchema,
  email: z.string().trim().toLowerCase().max(191).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  visibiliteContacts: visibiliteSchema.optional(),
  visibiliteProfil: visibiliteSchema.optional(),
  brancheId: z.coerce.number().int().positive().optional(),
  familleId: z.coerce.number().int().positive(),
  pereId: z.coerce.number().int().positive().optional(),
  mereId: z.coerce.number().int().positive().optional(),
};

export const createPersonneSchema = z
  .object({
    ...personneFieldsSchema,
    /** Bypasses the duplicate-detection check (same prénom/nom/dateNaissance
     * already registered) — mirrors the frontend's "cette personne semble
     * déjà exister, continuer quand même ?" confirmation step, stateless. */
    forcerCreation: z.boolean().optional().default(false),
  })
  .strict();
export type CreatePersonneInput = z.infer<typeof createPersonneSchema>;

/** PUT — full replacement of every modifiable field. `matricule` stays
 * server-assigned and immutable; `generation` is recomputed from
 * `pereId`/`mereId` when they change (see personne.service.ts). `actif`/
 * `deletedAt` are excluded: those change only through desactiver/restaurer. */
export const updatePersonneSchema = z.object(personneFieldsSchema).strict();
export type UpdatePersonneInput = z.infer<typeof updatePersonneSchema>;

/**
 * "Ajouter mes enfants" (espace personnel) — volontairement réduit au strict
 * minimum du recensement (voir personne.service.ts::creerEnfantConnecte) :
 * ni `nom` (toujours hérité du parent connecté), ni `familleId`/`pereId`
 * (toujours dérivés de l'utilisateur authentifié, jamais acceptés depuis le
 * client — un utilisateur connecté ne doit jamais pouvoir choisir un autre
 * parent que lui-même en falsifiant le corps de la requête).
 */
export const ajouterEnfantSchema = z
  .object({
    prenom: personneFieldsSchema.prenom,
    sexe: personneFieldsSchema.sexe,
    photo: personneFieldsSchema.photo,
    dateNaissance: personneFieldsSchema.dateNaissance,
    estAuVillage: personneFieldsSchema.estAuVillage,
    estEnGuinee: personneFieldsSchema.estEnGuinee,
  })
  .strict();
export type AjouterEnfantInput = z.infer<typeof ajouterEnfantSchema>;

/**
 * "Ajouter mon/ma conjoint·e" (espace personnel) — comme `ajouterEnfantSchema`,
 * réduit au minimum du formulaire (photo, prénom, nom, téléphone). Ni `sexe`
 * (déduit du sexe opposé de l'utilisateur connecté, voir
 * personne.service.ts::creerConjointConnecte), ni `familleId` (toujours celle
 * de l'utilisateur authentifié) : jamais acceptés depuis le client.
 * Contrairement à l'enfant, `nom` est demandé (pas hérité — un·e conjoint·e
 * garde le sien).
 */
export const ajouterConjointSchema = z
  .object({
    prenom: personneFieldsSchema.prenom,
    nom: personneFieldsSchema.nom,
    photo: personneFieldsSchema.photo,
    telephone: personneFieldsSchema.telephone,
    estAuVillage: personneFieldsSchema.estAuVillage,
    estEnGuinee: personneFieldsSchema.estEnGuinee,
  })
  .strict();
export type AjouterConjointInput = z.infer<typeof ajouterConjointSchema>;

export const listPersonneQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(1).max(100).optional(),
  /** Exact lookup, distinct from `recherche` (prénom/nom/profession
   * substring only) — a matricule (ex. "MSD-000042") never appears in any of
   * those fields, so it needs its own filter. Used by the "Nouveau membre"
   * wizard to resolve a father by the matricule the registering member
   * already knows. */
  matricule: z.string().trim().min(1).max(50).optional(),
  actif: booleanQueryParamSchema,
  inclureSupprimes: booleanQueryParamSchema,
  familleId: z.coerce.number().int().positive().optional(),
  /** Exact match, used by the "Habitants" page's profession filter — the
   * dropdown itself is populated from real recensed professions, never a
   * freeform guess, so an exact filter is enough (no `contains`). */
  profession: z.string().trim().min(1).max(150).optional(),
  estDecede: booleanQueryParamSchema,
  /** Real server-side sort for the "Habitants" page — `recent` (default,
   * matches the previous unconditional `createdAt desc`) needs no explicit
   * value from the client. */
  trierPar: z.enum(["nom", "recent", "generation"]).optional(),
});
export type ListPersonneQuery = z.infer<typeof listPersonneQuerySchema>;
