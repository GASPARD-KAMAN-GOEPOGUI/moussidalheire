import { z } from "zod";
import { sexeSchema, statutMatrimonialSchema } from "./common.validator";
import { personneFieldsSchema } from "./personne.validator";
import { versMajusculesSansAccent } from "@/utils/text";
import { motDePasseSchema } from "@/schemas/utilisateurs/utilisateur.primitives";

/**
 * Fields for a person created "on the fly" during self-registration (père,
 * mère, fratrie, conjoint, enfant) — same shape as `personneFieldsSchema`,
 * minus everything that's server-computed or inherited from the registering
 * member (`familleId`, `brancheId`, `pereId`/`mereId`, `matricule`,
 * `generation`).
 */
export const personneNouvelleSchema = z
  .object({
    prenom: personneFieldsSchema.prenom,
    nom: personneFieldsSchema.nom,
    sexe: personneFieldsSchema.sexe,
    photo: personneFieldsSchema.photo,
    dateNaissance: personneFieldsSchema.dateNaissance,
    lieuNaissance: personneFieldsSchema.lieuNaissance,
    estDecede: personneFieldsSchema.estDecede,
    statutMatrimonial: personneFieldsSchema.statutMatrimonial,
    profession: personneFieldsSchema.profession,
    niveauEtudes: personneFieldsSchema.niveauEtudes,
    bio: personneFieldsSchema.bio,
    telephone: personneFieldsSchema.telephone,
    email: personneFieldsSchema.email,
    whatsapp: personneFieldsSchema.whatsapp,
    estAuVillage: personneFieldsSchema.estAuVillage,
    estEnGuinee: personneFieldsSchema.estEnGuinee,
  })
  .strict();
export type PersonneNouvelleInput = z.infer<typeof personneNouvelleSchema>;

/**
 * A reference to a person involved in the registration — either an existing
 * `Personne` by id, or the data to create one. `mode` is discriminant so Zod
 * reports precise errors per branch. Used for père, mère, conjoints and
 * enfants — fratrie uses the richer `fratrieEntrySchema` below instead
 * (a "nouveau" sibling may need its own mère, distinct from the member's).
 */
export const personneRefSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existant"), id: z.coerce.number().int().positive() }).strict(),
  z.object({ mode: z.literal("nouveau"), donnees: personneNouvelleSchema }).strict(),
]);
export type PersonneRefInput = z.infer<typeof personneRefSchema>;

/**
 * A fratrie entry — same "existant vs nouveau" shape as `personneRefSchema`,
 * except a "nouveau" sibling may carry its own `mere` (existant or nouveau):
 * the père is always shared with the registering member, but the père may be
 * polygamous, so a new sibling's mère isn't always the member's own mère.
 * When omitted, auth.service.ts defaults it to the member's mère (full
 * sibling) — this field only exists to let the caller override that default
 * for a demi-frère/demi-sœur.
 */
export const fratrieEntrySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existant"), id: z.coerce.number().int().positive() }).strict(),
  z
    .object({
      mode: z.literal("nouveau"),
      donnees: personneNouvelleSchema,
      mere: personneRefSchema.optional(),
    })
    .strict(),
]);
export type FratrieEntryInput = z.infer<typeof fratrieEntrySchema>;

/** One union of the registering member: a conjoint plus the children born of
 * that specific union (as opposed to `enfantsAutres`, for children whose
 * other parent isn't part of this registration). */
export const unionEntrySchema = z
  .object({
    conjoint: personneRefSchema,
    enfants: z.array(personneRefSchema).max(20).optional().default([]),
  })
  .strict();
export type UnionEntryInput = z.infer<typeof unionEntrySchema>;

interface IdsExistantsSource {
  pere?: PersonneRefInput | undefined;
  mere?: PersonneRefInput | undefined;
  fratrie: FratrieEntryInput[];
  unions: UnionEntryInput[];
  enfantsAutres: PersonneRefInput[];
}

/** Every `existant` id referenced anywhere in the request — used to reject a
 * request that references the same person in two contradictory roles (e.g.
 * the same id as both père and fratrie). */
function collecterIdsExistants(data: IdsExistantsSource): number[] {
  const ids: number[] = [];
  const pousser = (ref?: PersonneRefInput) => {
    if (ref?.mode === "existant") ids.push(ref.id);
  };
  pousser(data.pere);
  pousser(data.mere);
  for (const f of data.fratrie) {
    if (f.mode === "existant") ids.push(f.id);
    else pousser(f.mere);
  }
  for (const u of data.unions) {
    pousser(u.conjoint);
    for (const e of u.enfants) pousser(e);
  }
  for (const e of data.enfantsAutres) pousser(e);
  return ids;
}

/**
 * Self-registration: creates a `Personne` + a linked `Utilisateur` together
 * (see auth.service.ts), and — optionally, in the same transaction — the
 * person's père, mère, fratrie, union(s)/conjoint(s) and enfants (both those
 * born of a specific union, and those whose other parent isn't declared
 * here). Same personal-data shape as `validators/personne.validator.ts`,
 * `email` included — optional and unique when provided, exactly like every
 * other `Personne`/`Utilisateur` email in the app (see `Personne.email`'s
 * doc comment in schema.prisma). When absent, the generated password is
 * never mailed anywhere (see email.service.ts) — it's only ever returned
 * once in the API response body (`motDePasseTemporaire`) so the frontend can
 * show it in a one-time modal right after creation; the account's
 * `identifiant` falls back to the freshly attributed matricule (see
 * auth.service.ts::inscrire).
 */
export const inscriptionSchema = z
  .object({
    prenom: z.string().trim().min(1).max(100),
    nom: z.string().trim().min(1).max(100).transform(versMajusculesSansAccent),
    sexe: sexeSchema,
    // Absent jusqu'ici : père/mère/fratrie/conjoint/enfant (personneNouvelleSchema)
    // pouvaient déjà recevoir une photo, jamais la personne principale elle-même.
    photo: personneFieldsSchema.photo,
    email: personneFieldsSchema.email,
    telephone: personneFieldsSchema.telephone,
    dateNaissance: z.coerce.date().optional(),
    lieuNaissance: z.string().trim().max(150).optional(),
    statutMatrimonial: statutMatrimonialSchema.optional(),
    profession: z.string().trim().max(150).optional(),
    estAuVillage: personneFieldsSchema.estAuVillage,
    estEnGuinee: personneFieldsSchema.estEnGuinee,
    // Optionnel : quand ni le père ni la mère n'ont de famille réelle
    // existante (les deux sont créés de toutes pièces, ou aucun des deux
    // n'est renseigné), l'utilisateur n'a par construction aucune famille à
    // choisir — voir `nouvelleFamille` ci-dessous, seule alternative dans ce
    // cas (voir le refine plus bas).
    familleId: z.coerce.number().int().positive().optional(),
    // Fonde une toute nouvelle famille (fondatrice) au nom du père/de la
    // personne qui s'inscrit, à l'intérieur même de la transaction
    // d'inscription — le seul cas où une famille peut être créée sans passer
    // par POST /familles (réservé aux admins) : un(e) inscrit(e) dont le père
    // n'existe pas encore dans le système ne peut pas être bloqué·e faute de
    // pouvoir désigner une famille qui n'existe pas encore.
    nouvelleFamille: z
      .object({ nom: z.string().trim().min(1).max(150).transform(versMajusculesSansAccent) })
      .strict()
      .optional(),
    pere: personneRefSchema.optional(),
    mere: personneRefSchema.optional(),
    fratrie: z.array(fratrieEntrySchema).max(20).optional().default([]),
    unions: z.array(unionEntrySchema).max(10).optional().default([]),
    // Enfants dont l'autre parent n'est pas déclaré dans cette inscription —
    // délibérément jamais bloqué par le statut matrimonial (une personne
    // "célibataire" aujourd'hui a pu avoir des enfants d'une relation passée).
    enfantsAutres: z.array(personneRefSchema).max(20).optional().default([]),
    forcerCreation: z.boolean().optional().default(false),
  })
  .strict()
  .refine(
    (data) =>
      data.statutMatrimonial === "celibataire" || data.statutMatrimonial === undefined
        ? data.unions.length === 0
        : true,
    {
      message: "Un(e) célibataire ne peut pas avoir d'union déclarée.",
      path: ["unions"],
    },
  )
  .refine(
    (data) =>
      data.pere === undefined || data.pere.mode !== "nouveau" || data.pere.donnees.sexe === "homme",
    {
      message: "Le père doit être une personne de sexe masculin.",
      path: ["pere", "donnees", "sexe"],
    },
  )
  .refine(
    (data) =>
      data.mere === undefined || data.mere.mode !== "nouveau" || data.mere.donnees.sexe === "femme",
    {
      message: "La mère doit être une personne de sexe féminin.",
      path: ["mere", "donnees", "sexe"],
    },
  )
  .refine(
    (data) =>
      data.fratrie.every(
        (f) =>
          f.mode !== "nouveau" ||
          f.mere === undefined ||
          f.mere.mode !== "nouveau" ||
          f.mere.donnees.sexe === "femme",
      ),
    {
      message: "La mère d'un frère ou d'une sœur doit être une personne de sexe féminin.",
      path: ["fratrie"],
    },
  )
  .refine(
    (data) =>
      !(
        data.pere?.mode === "existant" &&
        data.mere?.mode === "existant" &&
        data.pere.id === data.mere.id
      ),
    { message: "Le père et la mère ne peuvent pas être la même personne.", path: ["mere"] },
  )
  .refine(
    (data) => {
      const ids = collecterIdsExistants(data);
      return new Set(ids).size === ids.length;
    },
    {
      message:
        "Une même personne ne peut pas être référencée dans plusieurs rôles à la fois (père, mère, fratrie, conjoint, enfant...).",
      path: ["fratrie"],
    },
  )
  .refine(
    (data) =>
      data.familleId !== undefined ||
      data.nouvelleFamille !== undefined ||
      data.pere?.mode === "existant" ||
      data.mere?.mode === "existant",
    {
      message:
        "Indiquez une famille existante (familleId) ou les informations pour en fonder une nouvelle (nouvelleFamille).",
      path: ["familleId"],
    },
  );
export type InscriptionInput = z.infer<typeof inscriptionSchema>;

export const connexionSchema = z
  .object({
    identifiant: z
      .string()
      .trim()
      .min(1, "L'identifiant, l'e-mail, le matricule ou le téléphone est requis."),
    motDePasse: z.string().min(1, "Le mot de passe est requis."),
  })
  .strict();
export type ConnexionInput = z.infer<typeof connexionSchema>;

/** Body of `POST /auth/refresh` — see auth.service.ts::rafraichir. */
export const rafraichirSchema = z
  .object({
    refreshToken: z.string().min(1, "Le jeton de rafraîchissement est requis."),
  })
  .strict();
export type RafraichirInput = z.infer<typeof rafraichirSchema>;

/**
 * Body of `POST /auth/mot-de-passe` — self-service password change for the
 * currently authenticated utilisateur (see auth.service.ts::changerMotDePasse).
 * No `motDePasseActuel` field, by design — the bearer token alone authorizes
 * the change (see that function's doc comment for the trade-off this
 * implies). `nouveauMotDePasse` reuses the same strength rule as admin-set
 * passwords (`motDePasseSchema`), so a self-chosen password is never weaker
 * than what an admin could set for someone else.
 */
export const changerMotDePasseSchema = z
  .object({
    nouveauMotDePasse: motDePasseSchema,
  })
  .strict();
export type ChangerMotDePasseInput = z.infer<typeof changerMotDePasseSchema>;

/** Même règle que `connexionSchema.identifiant` : la réinitialisation accepte
 * exactement les identifiants de la connexion (voir password-reset.service.ts). */
const identifiantReinitialisationSchema = z
  .string()
  .trim()
  .min(1, "L'identifiant, l'e-mail, le matricule ou le téléphone est requis.")
  .max(191, "Cet identifiant est trop long.");

/** Body of `POST /auth/mot-de-passe-oublie`. */
export const motDePasseOublieSchema = z
  .object({ identifiant: identifiantReinitialisationSchema })
  .strict();
export type MotDePasseOublieInput = z.infer<typeof motDePasseOublieSchema>;

/**
 * Body of `POST /auth/verifier-code`. Le code n'est pas contraint à six
 * caractères ici : la saisie peut contenir des espaces ou des tirets, retirés
 * avant comparaison (voir code-otp.ts::normaliserCode). Un code mal formé
 * échoue simplement à la comparaison, avec le même message qu'un code faux.
 */
export const verifierCodeSchema = z
  .object({
    identifiant: identifiantReinitialisationSchema,
    code: z.string().trim().min(1, "Le code est requis.").max(20, "Ce code est trop long."),
  })
  .strict();
export type VerifierCodeInput = z.infer<typeof verifierCodeSchema>;

/** Body of `POST /auth/reinitialiser-mot-de-passe`. Même règle de complexité
 * que l'inscription et le changement volontaire (`motDePasseSchema`). */
export const reinitialiserMotDePasseSchema = z
  .object({
    jeton: z.string().min(1, "Le jeton de réinitialisation est requis."),
    nouveauMotDePasse: motDePasseSchema,
  })
  .strict();
export type ReinitialiserMotDePasseInput = z.infer<typeof reinitialiserMotDePasseSchema>;
