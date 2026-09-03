import { apiRequest } from "@/lib/api-client";
import { toPerson, type PersonneApi, type SexeApi, type StatutMatrimonialApi, type VisibiliteApi } from "./mappers";
import { resolveFamilleNumericId } from "./families";
import { notifyDataChanged } from "@/lib/sync-bus";
import type { PersonRef } from "@/components/auth/inscription-types";
import type { Person } from "@/types";

export interface PeopleQuery {
  search?: string;
  familyId?: string;
  location?: string;
  profession?: string;
  generation?: number;
  gender?: "male" | "female";
  status?: "living" | "deceased";
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "recent" | "generation";
}

export interface PeoplePage {
  items: Person[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface PersonnesListResponse {
  success: true;
  personnes: PersonneApi[];
  pagination: PaginationMeta;
}

interface PersonneResponse {
  success: true;
  personne: PersonneApi;
}

const ESTDECEDE_PAR_STATUT: Record<NonNullable<PeopleQuery["status"]>, boolean> = {
  living: false,
  deceased: true,
};

const TRIER_PAR: Record<NonNullable<PeopleQuery["sortBy"]>, string> = {
  name: "nom",
  recent: "recent",
  generation: "generation",
};

/** Three `PeopleQuery` fields the backend still can't filter itself —
 * `location` (now real, matched against `residenceHistory`'s one entry, see
 * mappers.ts, but still no `?lieu=` query param on `/personnes`) and
 * `gender`/`generation` (no query param support, and no UI control exercises
 * them today). Applied over whichever page the backend already returned, so
 * it only ever narrows that page further — harmless while these three stay
 * unused by the real UI, but would under-count `total`/`totalPages` (both
 * already resolved from the backend's own count) if a caller ever combined
 * one of them with real pagination. */
function matchesClientOnly(person: Person, q: PeopleQuery): boolean {
  if (typeof q.generation === "number" && person.generation !== q.generation) return false;
  if (q.gender && person.gender !== q.gender) return false;
  if (q.location) {
    const hasLoc = person.residenceHistory.some(
      (r) => r.current && r.location.city.toLowerCase() === q.location!.toLowerCase(),
    );
    if (!hasLoc) return false;
  }
  return true;
}

/**
 * Real server-side pagination/filtering/sorting — `recherche`, `familleId`,
 * `inclureSupprimes`, `profession`, `estDecede` and `trierPar` are all
 * applied by the backend itself (see personne.service.ts::lister), and
 * `page`/`pageSize`/`total`/`totalPages` below come straight from its own
 * count, not a client reslice of one capped page. Nothing here silently
 * drops habitants beyond the first 100 anymore.
 *
 * `includeInactive` maps to `inclureSupprimes` (soft-deleted/désactivé
 * personnes), not the `actif` query param — the backend's `actif` column is
 * never actually written by any mutation today (see mappers.ts), so it isn't
 * a meaningful filter yet.
 */
export async function listPeople(query: PeopleQuery = {}): Promise<PeoplePage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 24;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.search) params.set("recherche", query.search);
  if (query.includeInactive) params.set("inclureSupprimes", "true");
  if (query.profession) params.set("profession", query.profession);
  if (query.status) params.set("estDecede", String(ESTDECEDE_PAR_STATUT[query.status]));
  if (query.sortBy) params.set("trierPar", TRIER_PAR[query.sortBy]);
  if (query.familyId) {
    const numericId = await resolveFamilleNumericId(query.familyId);
    if (numericId !== undefined) params.set("familleId", String(numericId));
  }

  const res = await apiRequest<PersonnesListResponse>(`/personnes?${params.toString()}`);
  const items = res.personnes.map(toPerson).filter((p) => matchesClientOnly(p, query));
  return {
    items,
    total: res.pagination.total,
    page: res.pagination.page,
    pageSize: res.pagination.pageSize,
    totalPages: res.pagination.totalPages,
  };
}

export async function getPerson(id: string): Promise<Person | undefined> {
  try {
    const res = await apiRequest<PersonneResponse>(`/personnes/${id}`);
    return toPerson(res.personne);
  } catch {
    return undefined;
  }
}

export interface SpouseWithUnion extends Person {
  unionUuid: string;
  unionStatut: StatutUnionApi;
}

export async function getPersonRelations(id: string) {
  const person = await getPerson(id);
  if (!person) return undefined;

  const [father, mother, enfantsRes, fratrieRes, conjointsRes, numericId] = await Promise.all([
    person.fatherId ? getPerson(person.fatherId) : Promise.resolve(undefined),
    person.motherId ? getPerson(person.motherId) : Promise.resolve(undefined),
    apiRequest<{ success: true; enfants: PersonneApi[] }>(`/personnes/${id}/enfants`),
    apiRequest<{ success: true; fratrie: PersonneApi[] }>(`/personnes/${id}/fratrie`),
    apiRequest<{ success: true; conjoints: PersonneApi[] }>(`/personnes/${id}/conjoints`),
    resolvePersonneNumericId(id),
  ]);

  // Cross-referenced against the real `unions` table so each spouse carries
  // its own union's uuid + statut (needed to display/edit it) — `/conjoints`
  // itself only returns the personne, never the union linking them.
  const unionsRes = await apiRequest<UnionsListResponse>(`/unions?personneId=${numericId}`);
  const spouses: SpouseWithUnion[] = conjointsRes.conjoints.map((c) => {
    const union = unionsRes.unions.find((u) => u.epouxId === c.id || u.epouseId === c.id);
    return { ...toPerson(c), unionUuid: union?.uuid ?? "", unionStatut: union?.statut ?? "marie" };
  });

  return {
    father,
    mother,
    spouses,
    children: enfantsRes.enfants.map(toPerson),
    siblings: fratrieRes.fratrie.map(toPerson),
  };
}

/** Used directly by `PersonProfileContent`'s désactiver/réactiver button —
 * calls the real soft-delete/restore routes (never a physical delete), then
 * re-fetches through `getPerson` so the result is correctly enriched. */
export async function togglePersonActive(id: string, active: boolean): Promise<Person | undefined> {
  await apiRequest(`/personnes/${id}/${active ? "restaurer" : "desactiver"}`, { method: "POST" });
  notifyDataChanged("personne", id);
  return getPerson(id);
}

/** No dedicated aggregate endpoint exists for "distinct professions", so
 * this paginates through every personne (bounded by `MAX_PROFESSION_PAGES`,
 * a safety ceiling rather than an expected real size) instead of reading
 * just the first page — the profession filter needs to offer every real
 * value recensé, not just whichever 100 happened to load first. */
const MAX_PROFESSION_PAGES = 20;

export async function listProfessions(): Promise<string[]> {
  const professions = new Set<string>();
  let page = 1;
  for (;;) {
    const res = await apiRequest<PersonnesListResponse>(`/personnes?page=${page}&pageSize=100`);
    for (const p of res.personnes) if (p.profession) professions.add(p.profession);
    if (page >= res.pagination.totalPages || page >= MAX_PROFESSION_PAGES) break;
    page += 1;
  }
  return Array.from(professions).sort();
}

/** Distinct city names from the real `lieux` référentiel — a village-scale
 * dataset, so one page (pageSize 100) covers every real place recorded. */
export async function listResidenceCities(): Promise<string[]> {
  const res = await apiRequest<{ success: true; lieux: { ville: string }[] }>("/lieux?pageSize=100");
  return Array.from(new Set(res.lieux.map((l) => l.ville))).sort();
}

// ---------------------------------------------------------------------------
// Real writes — POST/PUT /personnes, POST /unions. Used by AddMemberDialog,
// NewMemberDialog, PersonForm (edit mode) and AddFamilyDialog. `matricule`/
// `generation` are never sent — always server-computed. `PUT /personnes/:id`
// is a full replace (no PATCH route exists), so `patchPersonneReelle` fetches
// the current record first and merges the partial change in, instead of
// clobbering the rest of the fiche with empty fields.
// ---------------------------------------------------------------------------

export interface PersonneReelleInput {
  prenom: string;
  nom: string;
  sexe: SexeApi;
  familleId: number;
  surnom?: string;
  photo?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  estDecede?: boolean;
  statutMatrimonial?: StatutMatrimonialApi;
  profession?: string;
  niveauEtudes?: string;
  bio?: string;
  telephone?: string;
  email?: string;
  whatsapp?: string;
  brancheId?: number;
  pereId?: number;
  mereId?: number;
  visibiliteContacts?: VisibiliteApi;
  visibiliteProfil?: VisibiliteApi;
  /** Situation géographique simplifiée — voir GeographicSituationFields côté
   * frontend et personne.service.ts::normaliserSituationGeographique côté
   * backend (qui force estEnGuinee=true quand estAuVillage=true, quoi que le
   * client envoie). */
  estAuVillage?: boolean;
  estEnGuinee?: boolean;
  forcerCreation?: boolean;
}

export async function creerPersonneReelle(input: PersonneReelleInput): Promise<Person> {
  const res = await apiRequest<PersonneResponse>("/personnes", { method: "POST", body: input });
  notifyDataChanged("personne", res.personne.uuid);
  return toPerson(res.personne);
}

/** Fetches the current fiche, merges `patch` over it (never dropping fields
 * the caller didn't mean to touch), and PUTs the full result back — the only
 * way to change a subset of fields given the backend's full-replace PUT. */
export async function patchPersonneReelle(
  uuid: string,
  patch: Partial<PersonneReelleInput>,
): Promise<Person> {
  const existingRes = await apiRequest<PersonneResponse>(`/personnes/${uuid}`);
  const e = existingRes.personne;
  const merged: PersonneReelleInput = {
    prenom: e.prenom,
    nom: e.nom,
    sexe: e.sexe,
    familleId: e.familleId,
    ...(e.surnom ? { surnom: e.surnom } : {}),
    ...(e.photo ? { photo: e.photo } : {}),
    ...(e.dateNaissance ? { dateNaissance: e.dateNaissance.slice(0, 10) } : {}),
    ...(e.lieuNaissance ? { lieuNaissance: e.lieuNaissance } : {}),
    ...(e.estDecede ? { estDecede: true } : {}),
    ...(e.statutMatrimonial ? { statutMatrimonial: e.statutMatrimonial } : {}),
    ...(e.profession ? { profession: e.profession } : {}),
    ...(e.niveauEtudes ? { niveauEtudes: e.niveauEtudes } : {}),
    ...(e.bio ? { bio: e.bio } : {}),
    ...(e.telephone ? { telephone: e.telephone } : {}),
    ...(e.email ? { email: e.email } : {}),
    ...(e.whatsapp ? { whatsapp: e.whatsapp } : {}),
    ...(e.brancheId ? { brancheId: e.brancheId } : {}),
    ...(e.pereId ? { pereId: e.pereId } : {}),
    ...(e.mereId ? { mereId: e.mereId } : {}),
    visibiliteContacts: e.visibiliteContacts,
    visibiliteProfil: e.visibiliteProfil,
    estAuVillage: e.estAuVillage,
    estEnGuinee: e.estEnGuinee,
    ...patch,
  };
  const res = await apiRequest<PersonneResponse>(`/personnes/${uuid}`, {
    method: "PUT",
    body: merged,
  });
  notifyDataChanged("personne", uuid);
  return toPerson(res.personne);
}

/** Numeric internal id behind a `Person`'s uuid — needed wherever a mutation
 * body wants `pereId`/`mereId`/`epouxId`/`epouseId` (always numeric),
 * but the caller only has the uuid `Person.id` mapped components use. */
export async function resolvePersonneNumericId(uuid: string): Promise<number> {
  const res = await apiRequest<PersonneResponse>(`/personnes/${uuid}`);
  return res.personne.id;
}

export type StatutUnionApi = "marie" | "divorce" | "veuf" | "partenaire";

export async function creerUnionReelle(
  epouxId: number,
  epouseId: number,
  statut: StatutUnionApi,
): Promise<void> {
  await apiRequest("/unions", { method: "POST", body: { epouxId, epouseId, statut } });
  notifyDataChanged("union");
}

interface UnionApi {
  id: number;
  uuid: string;
  epouxId: number;
  epouseId: number;
  statut: StatutUnionApi;
}

interface UnionsListResponse {
  success: true;
  unions: UnionApi[];
}

export async function estUnionEntre(aId: number, bId: number): Promise<boolean> {
  const res = await apiRequest<UnionsListResponse>(`/unions?personneId=${aId}`);
  return res.unions.some((u) => u.epouxId === bId || u.epouseId === bId);
}

/** Finds the (active) union between two personnes and soft-deactivates it —
 * never a physical delete. A no-op if no such union exists. Used to "retirer
 * un·e conjoint·e" from a fiche without ever touching the spouse's own
 * record. */
export async function retirerUnionEntre(aId: number, bId: number): Promise<void> {
  const res = await apiRequest<UnionsListResponse>(`/unions?personneId=${aId}`);
  const union = res.unions.find((u) => u.epouxId === bId || u.epouseId === bId);
  if (!union) return;
  await apiRequest(`/unions/${union.uuid}/desactiver`, { method: "POST" });
  notifyDataChanged("union");
}

/** `PUT /unions/:id` is a full replace (no PATCH route) — fetches the
 * current union first so `epouxId`/`epouseId` are preserved,
 * changing only `statut`. Used to record a marriage becoming a divorce/
 * veuvage without severing the union (unlike `retirerUnionEntre`, which
 * deactivates it entirely). */
export async function modifierUnionReelle(uuid: string, statut: StatutUnionApi): Promise<void> {
  const res = await apiRequest<{ success: true; union: UnionApi }>(`/unions/${uuid}`);
  await apiRequest(`/unions/${uuid}`, {
    method: "PUT",
    body: { epouxId: res.union.epouxId, epouseId: res.union.epouseId, statut },
  });
  notifyDataChanged("union");
}

interface ResidencePersonneApi {
  uuid: string;
  personneId: number;
  lieuId: number;
  estActuelle: boolean;
}

interface ResidencesPersonnesListResponse {
  success: true;
  residences: ResidencePersonneApi[];
}

/**
 * Sets a personne's résidence actuelle — updates the existing `estActuelle`
 * row in place when one already exists (single-location design: this is
 * meant to feel like editing one field, not adding a history entry), or
 * creates a new one otherwise. The backend also enforces "at most one
 * résidence actuelle per personne" server-side (see
 * `residence-personne.service.ts`) as a safety net, but updating in place is
 * what keeps a personne down to a single résidence row across repeated
 * edits.
 */
export async function definirResidenceActuelle(personneUuid: string, lieuId: number): Promise<void> {
  const personneId = await resolvePersonneNumericId(personneUuid);
  const res = await apiRequest<ResidencesPersonnesListResponse>(
    `/residences-personnes?personneId=${personneId}&estActuelle=true`,
  );
  const existante = res.residences[0];
  const body = { personneId, lieuId, estActuelle: true };
  if (existante) {
    await apiRequest(`/residences-personnes/${existante.uuid}`, { method: "PUT", body });
  } else {
    await apiRequest("/residences-personnes", { method: "POST", body });
  }
  notifyDataChanged("residence", personneUuid);
}

export interface CompteCreeApi {
  identifiant: string;
  motDePasseTemporaire: string;
}

/** One half of a couple as `POST /auth/inscription` reports it back —
 * `cree: true` only for a personne actually created by this call, in which
 * case `compte` carries her real, backend-generated credentials. */
export interface PersonneCoupleResultat {
  id: number;
  matricule: string | null;
  prenom: string;
  nom: string;
  sexe: SexeApi;
  cree: boolean;
  compte?: CompteCreeApi;
}

export interface InscriptionCoupleInput {
  /** The half of the couple (or, under polygamie, the époux commun) that is
   * newly created — `/auth/inscription` always creates exactly one new
   * "principal" personne per call; every other half travels as one of her/
   * his conjoints (existant ou nouveau, see `conjoints`) — chacun dans sa
   * PROPRE union distincte (jamais fusionnées), l'endpoint acceptant déjà
   * un tableau `unions[]`. */
  prenom: string;
  nom: string;
  sexe: SexeApi;
  /** Facultatif, comme partout ailleurs (voir `Personne.email` dans
   * schema.prisma) — quand absent, l'identifiant du compte créé retombe sur
   * le matricule attribué par le backend (voir auth.service.ts::inscrire). */
  email?: string;
  telephone?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  profession?: string;
  /** Numeric id of the family the new couple belongs to. */
  familleId: number;
  /** Un ou plusieurs conjoints — un par union distincte (polygamie), chacun
   * `{mode:"existant", id}` ou `{mode:"nouveau", donnees}` — build with
   * `toPayloadRef` from `@/components/auth/inscription-types`. */
  conjoints: Record<string, unknown>[];
}

interface InscriptionCoupleResponse {
  success: true;
  personne: { id: number; prenom: string; nom: string; matricule: string | null };
  utilisateur: { identifiant: string };
  motDePasseTemporaire: string;
  unions: { conjoint: PersonneCoupleResultat }[];
}

/**
 * Creates the "principal" half of a couple (or, sous polygamie, l'époux
 * commun) as a real `Personne` + `Utilisateur` account, et chaque conjoint
 * (existant ou nouveau) dans sa PROPRE union, en un seul appel — reusing
 * `POST /auth/inscription` (the only endpoint that creates a compte, see
 * `creerPersonneReelle`'s doc comment: a bare `POST /personnes` never does).
 * No `pere`/`mere`/`fratrie` declared: this is exclusively used to found a
 * couple (ou une union polygame) pour une nouvelle famille, jamais une
 * inscription complète. `seConnecterApresCreation` never applies here — the
 * returned `token` is always ignored, exactly like `NewMemberDialog` when
 * opened for someone other than the person actually being created.
 */
export async function inscrireCoupleReel(
  input: InscriptionCoupleInput,
): Promise<{ principal: PersonneCoupleResultat & { compte: CompteCreeApi }; conjoints: PersonneCoupleResultat[] }> {
  const res = await apiRequest<InscriptionCoupleResponse>("/auth/inscription", {
    method: "POST",
    body: {
      prenom: input.prenom,
      nom: input.nom,
      sexe: input.sexe,
      ...(input.email ? { email: input.email } : {}),
      ...(input.telephone ? { telephone: input.telephone } : {}),
      ...(input.dateNaissance ? { dateNaissance: input.dateNaissance } : {}),
      ...(input.lieuNaissance ? { lieuNaissance: input.lieuNaissance } : {}),
      ...(input.profession ? { profession: input.profession } : {}),
      familleId: input.familleId,
      statutMatrimonial: "marie",
      unions: input.conjoints.map((conjoint) => ({ conjoint, enfants: [] })),
    },
  });
  notifyDataChanged("personne");
  return {
    principal: {
      id: res.personne.id,
      matricule: res.personne.matricule,
      prenom: res.personne.prenom,
      nom: res.personne.nom,
      sexe: input.sexe,
      cree: true,
      compte: { identifiant: res.utilisateur.identifiant, motDePasseTemporaire: res.motDePasseTemporaire },
    },
    conjoints: res.unions.map((u) => u.conjoint),
  };
}

/** Turns a `PersonRef` ("existant" or "nouveau") into the numeric id it
 * ultimately resolves to — creating the fiche first if it's a draft. Shared
 * by every form that lets someone pick-or-create a related personne
 * (père/mère/conjoint/frère-sœur) and needs a concrete FK to write. */
export async function resolvePersonRef(ref: PersonRef, familleId: number): Promise<{ id: number; uuid: string }> {
  if (ref.mode === "existant") return { id: ref.id, uuid: ref.uuid };
  const donnees = ref.donnees;
  const input: PersonneReelleInput = {
    prenom: donnees.prenom.trim(),
    nom: donnees.nom.trim(),
    sexe: donnees.sexe,
    familleId,
    ...(donnees.photo.trim() ? { photo: donnees.photo.trim() } : {}),
    ...(donnees.dateNaissance ? { dateNaissance: donnees.dateNaissance } : {}),
    ...(donnees.lieuNaissance.trim() ? { lieuNaissance: donnees.lieuNaissance.trim() } : {}),
    ...(donnees.estDecede ? { estDecede: true } : {}),
    ...(donnees.statutMatrimonial ? { statutMatrimonial: donnees.statutMatrimonial } : {}),
    ...(donnees.profession.trim() ? { profession: donnees.profession.trim() } : {}),
    ...(donnees.niveauEtudes.trim() ? { niveauEtudes: donnees.niveauEtudes.trim() } : {}),
    ...(donnees.bio.trim() ? { bio: donnees.bio.trim() } : {}),
    ...(donnees.telephone.trim() ? { telephone: donnees.telephone.trim() } : {}),
    ...(donnees.email.trim() ? { email: donnees.email.trim() } : {}),
    ...(donnees.whatsapp.trim() ? { whatsapp: donnees.whatsapp.trim() } : {}),
    estAuVillage: donnees.estAuVillage,
    estEnGuinee: donnees.estEnGuinee,
  };
  const created = await creerPersonneReelle(input);
  const id = await resolvePersonneNumericId(created.id);
  return { id, uuid: created.id };
}

export interface CompteEnfantApi {
  identifiant: string;
  motDePasseTemporaire: string;
}

export interface AjouterMonEnfantInput {
  prenom: string;
  sexe: SexeApi;
  photo?: string;
  dateNaissance?: string;
  estAuVillage?: boolean;
  estEnGuinee?: boolean;
}

interface AjouterEnfantResponse {
  success: true;
  personne: PersonneApi;
  compte: CompteEnfantApi;
}

/**
 * "Ajouter mes enfants" (espace personnel) — `POST /personnes/moi/enfants`,
 * jamais `POST /personnes` : le parent est déterminé côté backend depuis
 * l'utilisateur authentifié, jamais depuis un `pereId` envoyé ici (l'endpoint
 * n'accepte d'ailleurs même pas ce champ). Contrairement à
 * `creerPersonneReelle`, cette création reçoit toujours un vrai compte
 * `Utilisateur` — voir `personne.service.ts::creerEnfantConnecte` côté
 * backend.
 */
export async function ajouterMonEnfant(
  input: AjouterMonEnfantInput,
): Promise<{ personne: Person; compte: CompteEnfantApi }> {
  const res = await apiRequest<AjouterEnfantResponse>("/personnes/moi/enfants", {
    method: "POST",
    body: input,
  });
  notifyDataChanged("personne", res.personne.uuid);
  return { personne: toPerson(res.personne), compte: res.compte };
}

export interface AjouterMonConjointInput {
  prenom: string;
  nom: string;
  photo?: string;
  telephone?: string;
}

interface AjouterConjointResponse {
  success: true;
  personne: PersonneApi;
  compte: CompteEnfantApi;
}

/**
 * "Ajouter mon/ma conjoint·e" (espace personnel) — `POST /personnes/moi/conjoint`,
 * jamais `POST /personnes` + `POST /unions` séparément : le sexe (déduit de
 * l'opposé de l'utilisateur connecté) et l'union (statut "marie") sont
 * toujours déterminés côté backend, jamais depuis ce formulaire. Comme
 * `ajouterMonEnfant`, cette création reçoit toujours un vrai compte
 * `Utilisateur` — voir `personne.service.ts::creerConjointConnecte` côté
 * backend.
 */
export async function ajouterMonConjoint(
  input: AjouterMonConjointInput,
): Promise<{ personne: Person; compte: CompteEnfantApi }> {
  const res = await apiRequest<AjouterConjointResponse>("/personnes/moi/conjoint", {
    method: "POST",
    body: input,
  });
  notifyDataChanged("personne", res.personne.uuid);
  return { personne: toPerson(res.personne), compte: res.compte };
}
