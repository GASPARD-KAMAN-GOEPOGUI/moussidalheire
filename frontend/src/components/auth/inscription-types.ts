/**
 * Types for the real, API-backed self-registration wizard (NewMemberDialog).
 * Deliberately separate from `src/types/index.ts` (`Person`, `PersonInput`,
 * ...), which models the mock data layer used by AddMemberDialog/PersonForm —
 * those have string ids generated client-side, while the real backend uses
 * numeric ids and a different field set.
 */

export type Sexe = "homme" | "femme";
export type StatutMatrimonial = "celibataire" | "marie" | "divorce" | "veuf";

/** A person fetched from `GET /personnes` — enough to display and to send
 * back as an `{mode:"existant", id}` reference. `familleId` is present on the
 * real API response (every personne belongs to a famille) — exposed here so
 * a père/mère resolved by matricule or by name search can lend the
 * registering member their own famille, without a second network call.
 * Optional (not every caller populates it — e.g. `AddMemberDialog`'s own
 * hand-built refs from an already-loaded `Person`, a different type system). */
export interface ApiPersonneResume {
  id: number;
  uuid: string;
  prenom: string;
  nom: string;
  matricule: string | null;
  sexe: Sexe;
  familleId?: number;
  photo?: string | null;
}

/** Fields for a person created "on the fly" (père, mère, fratrie, conjoint) —
 * mirrors `personneNouvelleSchema` on the backend (auth.validator.ts). Form
 * values are kept as strings (native input values); `buildInscriptionPayload`
 * converts empty strings to absent fields before sending. */
export interface NouvellePersonneForm {
  prenom: string;
  nom: string;
  sexe: Sexe;
  photo: string;
  dateNaissance: string;
  lieuNaissance: string;
  /** Simple statut vivant·e/décédé·e — jamais de date de décès (voir
   * `Personne.estDecede` côté backend, qui a remplacé `dateDeces`). */
  estDecede: boolean;
  statutMatrimonial: StatutMatrimonial | "";
  profession: string;
  niveauEtudes: string;
  bio: string;
  telephone: string;
  email: string;
  whatsapp: string;
  /** Situation géographique simplifiée — non pertinente quand `estDecede` est
   * vrai (voir GeographicSituationFields), mais toujours deux vrais booléens
   * ici : `estAuVillage: true` implique toujours `estEnGuinee: true`. */
  estAuVillage: boolean;
  estEnGuinee: boolean;
}

export function emptyNouvellePersonne(sexe: Sexe = "homme"): NouvellePersonneForm {
  return {
    prenom: "",
    nom: "",
    sexe,
    photo: "",
    dateNaissance: "",
    lieuNaissance: "",
    estDecede: false,
    statutMatrimonial: "",
    profession: "",
    niveauEtudes: "",
    bio: "",
    telephone: "",
    email: "",
    whatsapp: "",
    estAuVillage: true,
    estEnGuinee: true,
  };
}

/** A reference to a person involved in the registration — either picked from
 * the existing population, or created on the fly. The `existant` branch keeps
 * a few display fields locally (name, matricule) purely for the UI; only
 * `mode`/`id` are ever sent to the backend for that branch. */
export type PersonRef =
  | ({ mode: "existant" } & ApiPersonneResume)
  | { mode: "nouveau"; donnees: NouvellePersonneForm };

export function personRefLabel(ref: PersonRef): string {
  const { prenom, nom } = ref.mode === "existant" ? ref : ref.donnees;
  return [prenom, nom].filter(Boolean).join(" ") || "Sans nom";
}

/** Two-letter initials for an avatar fallback — shared by every place that
 * shows a personne's avatar (père/mère pickers, suggestions). */
export function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

/** Strips a `NouvellePersonneForm`'s empty-string fields down to the shape
 * `personneNouvelleSchema` (auth.validator.ts) expects — same conversion
 * NewMemberDialog keeps as a private helper; exported here (additive only,
 * NewMemberDialog itself is untouched) so any other caller building a
 * `/auth/inscription` payload doesn't have to duplicate it a third time. */
export function toPersonneNouvelleDonnees(donnees: NouvellePersonneForm): Record<string, unknown> {
  const out: Record<string, unknown> = { prenom: donnees.prenom.trim(), nom: donnees.nom.trim(), sexe: donnees.sexe };
  if (donnees.photo.trim()) out.photo = donnees.photo.trim();
  if (donnees.dateNaissance) out.dateNaissance = donnees.dateNaissance;
  if (donnees.lieuNaissance.trim()) out.lieuNaissance = donnees.lieuNaissance.trim();
  if (donnees.estDecede) out.estDecede = true;
  if (donnees.statutMatrimonial) out.statutMatrimonial = donnees.statutMatrimonial;
  if (donnees.profession.trim()) out.profession = donnees.profession.trim();
  if (donnees.niveauEtudes.trim()) out.niveauEtudes = donnees.niveauEtudes.trim();
  if (donnees.bio.trim()) out.bio = donnees.bio.trim();
  if (donnees.telephone.trim()) out.telephone = donnees.telephone.trim();
  if (donnees.email.trim()) out.email = donnees.email.trim();
  if (donnees.whatsapp.trim()) out.whatsapp = donnees.whatsapp.trim();
  // Toujours envoyés (jamais conditionnels comme les champs texte ci-dessus) :
  // contrairement à "vide = absent", `false` est une vraie réponse ici, pas
  // une valeur par défaut à omettre.
  out.estAuVillage = donnees.estAuVillage;
  out.estEnGuinee = donnees.estEnGuinee;
  return out;
}

/** A `PersonRef` as the `personneRefSchema` discriminated union expects it on
 * the wire — `{mode:"existant", id}` or `{mode:"nouveau", donnees}`. */
export function toPayloadRef(ref: PersonRef): Record<string, unknown> {
  if (ref.mode === "existant") return { mode: "existant", id: ref.id };
  return { mode: "nouveau", donnees: toPersonneNouvelleDonnees(ref.donnees) };
}

/**
 * A fratrie entry — same as `PersonRef`, except a "nouveau" sibling may carry
 * its own `mere` (the père is always shared with the registering member, but
 * a polygamous père can have children from different mères — a demi-frère/
 * demi-sœur). Mirrors `fratrieEntrySchema` on the backend. When `mere` is
 * omitted, the backend defaults it to the registering member's own mère.
 */
export type FratrieRef =
  | ({ mode: "existant" } & ApiPersonneResume)
  | { mode: "nouveau"; donnees: NouvellePersonneForm; mere?: PersonRef | null };

export function fratrieRefLabel(ref: FratrieRef): string {
  const { prenom, nom } = ref.mode === "existant" ? ref : ref.donnees;
  return [prenom, nom].filter(Boolean).join(" ") || "Sans nom";
}

/** One union of the registering member: a conjoint plus the children born of
 * that specific union — distinct from children whose other parent isn't
 * declared in this registration (see NewMemberDialog's `enfantsAutres`).
 * Mirrors `unionEntrySchema` on the backend. */
export interface UnionRef {
  conjoint: PersonRef | null;
  enfants: PersonRef[];
}

export function emptyUnion(): UnionRef {
  return { conjoint: null, enfants: [] };
}

/** Mirrors the backend's `CompteCree` (`auth.service.ts`) — present on a
 * `PersonneLiee` only when `cree` est vrai : une personne déjà existante,
 * simplement rattachée à l'inscription, ne reçoit jamais de nouveau compte. */
export interface CompteCree {
  identifiant: string;
  motDePasseTemporaire: string;
}

/** One account to display in `CredentialsDialog` — `role` is a short French
 * label ("Vous", "Père", "Mère", "Frère/Sœur", "Conjoint·e", "Enfant") used
 * as a heading in the UI and in the shared/copied text; `nomComplet` is the
 * actual person's name. `matricule` is optional only because a `PersonneLiee`
 * technically allows `null` — in practice every created personne gets one. */
export interface CompteAffiche {
  role: string;
  nomComplet: string;
  matricule?: string;
  identifiant: string;
  motDePasseTemporaire: string;
}
