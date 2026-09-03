/**
 * The one place that translates the real backend's Personne/Famille shape
 * (French field names, numeric internal ids + UUIDs, its own enums) into the
 * frontend's existing `Person`/`Family` types — kept unchanged so every
 * display component (`PersonCard`, `FamilyCard`, `GenealogyTree`, ...) works
 * without modification. See `src/types/index.ts` for the target shapes.
 */
import type { Family, Gender, MaritalStatus, NewsItem, Person, Visibility } from "@/types";

export type SexeApi = "homme" | "femme";
export type StatutMatrimonialApi = "celibataire" | "marie" | "divorce" | "veuf";
export type VisibiliteApi = "public" | "membres" | "prive";

/** The `personnes` API response shape, including the `pereUuid`/`mereUuid`/
 * `familleUuid` enrichment added alongside the existing numeric FKs (see
 * backend `personne.service.ts::enrichirAvecUuids`). */
export interface PersonneApi {
  id: number;
  uuid: string;
  matricule: string | null;
  prenom: string;
  nom: string;
  surnom?: string | null;
  sexe: SexeApi;
  photo?: string | null;
  dateNaissance?: string | null;
  lieuNaissance?: string | null;
  estDecede?: boolean;
  statutMatrimonial?: StatutMatrimonialApi | null;
  profession?: string | null;
  niveauEtudes?: string | null;
  bio?: string | null;
  telephone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  visibiliteContacts: VisibiliteApi;
  visibiliteProfil: VisibiliteApi;
  /** Situation géographique simplifiée — deux vrais booléens en base (jamais
   * null), sans rapport avec `residenceActuelle` (ville précise) ci-dessous.
   * Non pertinents pour une personne décédée. */
  estAuVillage: boolean;
  estEnGuinee: boolean;
  actif: boolean;
  generation: number;
  brancheId?: number | null;
  familleId: number;
  pereId?: number | null;
  mereId?: number | null;
  createdAt: string;
  deletedAt?: string | null;
  pereUuid?: string;
  mereUuid?: string;
  familleUuid: string;
  brancheNom?: string;
  /** The one résidence marquée `estActuelle` for this personne, flattened
   * with its `Lieu` (see backend `personne.service.ts::enrichirAvecUuids`) —
   * absent when the personne has none yet. */
  residenceActuelle?: {
    residenceUuid: string;
    lieuUuid: string;
    pays: string;
    ville: string;
    region?: string;
    quartier?: string;
    estVillage: boolean;
    latitude?: number;
    longitude?: number;
    anneeDebut?: number;
  };
  /** Reflète, pour l'affichage seulement (afficher/masquer le bouton
   * "Modifier"), la même règle que le backend applique réellement sur
   * `PUT /personnes/:id` (voir personne.service.ts::peutModifierPersonne) —
   * absent des réponses de liste, présent uniquement sur `GET /personnes/:id`. */
  peutModifier?: boolean;
}

export interface FamilleApi {
  id: number;
  uuid: string;
  nom: string;
  description?: string | null;
  histoire?: string | null;
  devise?: string | null;
  imageCouverture?: string | null;
  ancetreId?: number | null;
  ancetreUuid?: string;
  familleParenteId?: number | null;
  estFondatrice: boolean;
  /** Posé une seule fois à la création, jamais recalculé — distingue une
   * VRAIE famille fondatrice d'une famille descendante temporairement sans
   * parent (rattachement coupé), que `estFondatrice` seul (dérivé de
   * `familleParenteId === null`) ne peut pas représenter : les deux
   * vaudraient sinon la même chose. Voir le commentaire sur la colonne
   * `est_fondatrice_origine` dans schema.prisma côté backend. */
  estFondatriceOrigine: boolean;
  deletedAt?: string | null;
}

function toGender(sexe: SexeApi): Gender {
  return sexe === "homme" ? "male" : "female";
}

function toVisibility(v: VisibiliteApi): Visibility {
  return v === "membres" ? "members" : v === "prive" ? "private" : "public";
}

export function toVisibiliteApi(v: Visibility): VisibiliteApi {
  return v === "members" ? "membres" : v === "private" ? "prive" : "public";
}

function toYear(iso?: string | null): number | undefined {
  return iso ? new Date(iso).getFullYear() : undefined;
}

/**
 * Maps a `personnes` API record to a `Person`. `spouseIds`/`childrenIds`/
 * `siblingIds` are always empty here — populated separately by
 * `getPersonRelations` via the real `/enfants /fratrie /conjoints` routes,
 * exactly like the mock version already did (`PersonProfileContent` calls
 * `getPerson` and `getPersonRelations` independently, unchanged).
 * `residenceHistory` carries at most one entry — the real résidence actuelle
 * (single-location design, see `services/api/lieux.ts`), never a full
 * history: the backend's `ResidencePersonne` table can hold several rows per
 * personne, but only the one marked `estActuelle` is ever surfaced here.
 * `branch` is the branche's name, resolved server-side from `brancheId`.
 */
export function toPerson(p: PersonneApi): Person {
  return {
    id: p.uuid,
    matricule: p.matricule ?? "",
    firstName: p.prenom,
    lastName: p.nom,
    ...(p.surnom ? { nickname: p.surnom } : {}),
    gender: toGender(p.sexe),
    ...(p.photo ? { photoUrl: p.photo } : {}),
    ...(p.dateNaissance ? { birthYear: toYear(p.dateNaissance), birthDate: p.dateNaissance.slice(0, 10) } : {}),
    ...(p.lieuNaissance ? { birthPlace: p.lieuNaissance } : {}),
    isDeceased: !!p.estDecede,
    ...(p.statutMatrimonial ? { maritalStatus: p.statutMatrimonial as MaritalStatus } : {}),
    isInVillage: p.estAuVillage,
    isInGuinea: p.estEnGuinee,

    familyId: p.familleUuid,
    generation: p.generation,
    branch: p.brancheNom ?? "",

    ...(p.pereUuid ? { fatherId: p.pereUuid } : {}),
    ...(p.mereUuid ? { motherId: p.mereUuid } : {}),
    spouseIds: [],
    childrenIds: [],
    siblingIds: [],

    residenceHistory: p.residenceActuelle
      ? [
          {
            id: p.residenceActuelle.residenceUuid,
            location: {
              id: p.residenceActuelle.lieuUuid,
              country: p.residenceActuelle.pays,
              city: p.residenceActuelle.ville,
              ...(p.residenceActuelle.region ? { region: p.residenceActuelle.region } : {}),
              ...(p.residenceActuelle.quartier ? { district: p.residenceActuelle.quartier } : {}),
              ...(p.residenceActuelle.estVillage ? { isVillage: true } : {}),
              ...(p.residenceActuelle.latitude !== undefined ? { lat: p.residenceActuelle.latitude } : {}),
              ...(p.residenceActuelle.longitude !== undefined ? { lng: p.residenceActuelle.longitude } : {}),
            },
            ...(p.residenceActuelle.anneeDebut !== undefined
              ? { startYear: p.residenceActuelle.anneeDebut }
              : {}),
            current: true,
          },
        ]
      : [],

    ...(p.profession ? { profession: p.profession } : {}),
    ...(p.niveauEtudes ? { educationLevel: p.niveauEtudes } : {}),
    ...(p.bio ? { bio: p.bio } : {}),
    ...(p.telephone || p.email || p.whatsapp
      ? {
          contact: {
            ...(p.telephone ? { phone: p.telephone } : {}),
            ...(p.email ? { email: p.email } : {}),
            ...(p.whatsapp ? { whatsapp: p.whatsapp } : {}),
            visibility: toVisibility(p.visibiliteContacts),
          },
        }
      : {}),
    visibility: toVisibility(p.visibiliteProfil),
    // `actif` is a DB column that's never actually written by any backend
    // mutation today (always its default `true`) — the real "désactiver/
    // réactiver" lifecycle the UI's toggle button drives operates on
    // `deletedAt` (soft-delete), so that's the field that reflects it here.
    isActive: !p.deletedAt,
    registeredAt: p.createdAt,
    ...(p.peutModifier !== undefined ? { canEdit: p.peutModifier } : {}),
  };
}

/** Maps a `familles` API record to a `Family`. `description`/`ancestorId`
 * are required (non-optional) on the frontend's `Family` type — defaulted to
 * `""` when the backend has nothing to offer (families created without an
 * ancêtre, or with no description). */
export function toFamily(f: FamilleApi): Family {
  return {
    id: f.uuid,
    name: f.nom,
    ancestorId: f.ancetreUuid ?? "",
    description: f.description ?? "",
    ...(f.histoire ? { history: f.histoire } : {}),
    ...(f.imageCouverture ? { coverImageUrl: f.imageCouverture } : {}),
    ...(f.devise ? { motto: f.devise } : {}),
  };
}

/** The `actualites` API response shape, including the `categorieUuid`/
 * `categorieNom`/`categorieSlug`/`familleUuid` enrichment (see backend
 * `actualite.service.ts::enrichirAvecUuids`, mirrors the personne pattern). */
export interface ActualiteApi {
  id: number;
  uuid: string;
  titre: string;
  categorieId: number;
  categorieUuid: string;
  categorieNom: string;
  categorieSlug: string;
  imageCouverture?: string | null;
  resume: string;
  contenu: string;
  auteur?: string | null;
  datePublication: string;
  miseEnAvant: boolean;
  familleId?: number | null;
  familleUuid?: string;
  deletedAt?: string | null;
}

export function toNewsItem(a: ActualiteApi): NewsItem {
  return {
    id: a.uuid,
    title: a.titre,
    category: { id: a.categorieUuid, nom: a.categorieNom, slug: a.categorieSlug },
    ...(a.imageCouverture ? { coverImageUrl: a.imageCouverture } : {}),
    excerpt: a.resume,
    content: a.contenu,
    authorName: a.auteur ?? "",
    publishedAt: a.datePublication,
    ...(a.familleUuid ? { relatedFamilyId: a.familleUuid } : {}),
    ...(a.miseEnAvant ? { featured: true } : {}),
    isActive: !a.deletedAt,
  };
}
