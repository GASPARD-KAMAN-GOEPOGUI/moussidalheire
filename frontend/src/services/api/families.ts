import { apiRequest } from "@/lib/api-client";
import { toFamily, toPerson, type FamilleApi, type PersonneApi } from "./mappers";
import { notifyDataChanged } from "@/lib/sync-bus";
import type { Family, Person } from "@/types";

/** Distinct current-residence city names among a family's members — derived
 * from each member's (real, single-entry) `residenceHistory`, never a
 * separate network call. A member with no résidence actuelle recorded yet
 * contributes nothing. */
function locationsFromMembers(members: Person[]): string[] {
  const villes = new Set<string>();
  for (const m of members) {
    const ville = m.residenceHistory.find((r) => r.current)?.location.city;
    if (ville) villes.add(ville);
  }
  return Array.from(villes).sort();
}

export interface FamilySummary extends Family {
  memberCount: number;
  generationCount: number;
  livingCount: number;
  locations: string[];
  /** Resolved from the family's own member list (the ancêtre is, by
   * construction, one of its members) — never a separate network call. */
  ancestor?: Person;
  /** No `familleParenteId` (raw column) → fondatrice. Computed server-side,
   * never derived client-side. Utile pour la hiérarchie (une famille sans
   * parent EST la racine de ce qu'il reste de sa chaîne, qu'elle ait été
   * fondée ainsi ou détachée depuis) — mais PAS pour classer une famille
   * comme "fondatrice" dans l'UI : voir `estFondatriceOrigine` pour ça. */
  estFondatrice: boolean;
  /** Posé une seule fois à la création, jamais recalculé — LA source de
   * vérité pour classer une famille comme fondatrice dans l'UI (onglets,
   * badges, listes de lignées). Une descendante détachée de son parent reste
   * `estFondatriceOrigine: false` pour toujours, même si `estFondatrice`
   * devient vrai entre-temps. */
  estFondatriceOrigine: boolean;
  familleParenteId?: number;
  estActive: boolean;
  /** Profondeur dans la hiérarchie `familleParenteId` — 0 pour une famille
   * fondatrice, sinon la longueur de `GET /familles/:id/chaine` moins un.
   * Jamais stockée en base (aucun champ `generation` sur `Famille`) : une
   * famille fondatrice le sait sans appel réseau (elle n'a pas de chaîne à
   * remonter), une descendante nécessite un aller-retour supplémentaire —
   * même compromis "à l'échelle d'un village" que `memberCount` ci-dessus. */
  generation: number;
}

/** A family entry as returned by `/familles/:id/chaine` or `/relatives` —
 * lighter than `FamilySummary` (no member-count aggregation, which would
 * mean one extra `/personnes` round-trip per link in a breadcrumb/list that
 * only needs a name and a badge). `generation` is only populated by
 * `listFamilyDescendants` below (the other callers of `toHierarchyEntry`
 * don't need it and leave it undefined). */
export interface FamilyHierarchyEntry extends Family {
  estFondatrice: boolean;
  estFondatriceOrigine: boolean;
  familleParenteId?: number;
  generation?: number;
}

function toHierarchyEntry(f: FamilleApi, generation?: number): FamilyHierarchyEntry {
  return {
    ...toFamily(f),
    estFondatrice: f.estFondatrice,
    estFondatriceOrigine: f.estFondatriceOrigine,
    ...(f.familleParenteId ? { familleParenteId: f.familleParenteId } : {}),
    ...(generation !== undefined ? { generation } : {}),
  };
}

interface FamillesListResponse {
  success: true;
  familles: FamilleApi[];
}

interface FamilleResponse {
  success: true;
  famille: FamilleApi;
}

interface PersonnesListResponse {
  success: true;
  personnes: PersonneApi[];
}

interface FamillesHierarchyResponse {
  success: true;
  chaine?: FamilleApi[];
  relatives?: FamilleApi[];
}

/** 0 pour une fondatrice (rien à remonter) ; sinon la profondeur réelle via
 * `GET /familles/:id/chaine`, jamais une valeur devinée côté client. */
async function fetchGenerationDepth(famille: FamilleApi): Promise<number> {
  if (famille.estFondatrice) return 0;
  const res = await apiRequest<FamillesHierarchyResponse>(`/familles/${famille.uuid}/chaine`);
  return (res.chaine?.length ?? 1) - 1;
}

/** Synchronous family lookup for presentational components (`PersonCard`,
 * `PersonQuickView`, `FamilyCard`, ...) that can't await a fetch mid-render —
 * mirrors the mock generator's `getFamilyById` ergonomics. Repopulated by
 * every `listFamilies()`/`getFamily()` call; the page that renders these
 * cards always fetches the family list for its own filter/selector first, so
 * the cache is warm by the time cards render. Trade-off: can be briefly
 * stale for a family created elsewhere in the same session — acceptable for
 * a display-only label, not a decision-critical value. */
const familyCache = new Map<string, FamilySummary>();
function cacheFamilies(families: FamilySummary[]): void {
  for (const f of families) familyCache.set(f.id, f);
}
export function getFamilyByIdSync(id: string): FamilySummary | undefined {
  return familyCache.get(id);
}

/** `Person.familyId`/`PeopleQuery.familyId` are UUIDs (matching `Family.id`),
 * but the backend's `GET /personnes?familleId=` filter expects the internal
 * numeric id. Resolved from whichever family fetch already ran (`summarize`
 * populates this for every family it touches); falls back to a single
 * `GET /familles/:id` when the uuid hasn't been seen yet. */
const numericIdByUuid = new Map<string, number>();
export async function resolveFamilleNumericId(uuid: string): Promise<number | undefined> {
  const cached = numericIdByUuid.get(uuid);
  if (cached !== undefined) return cached;
  try {
    const res = await apiRequest<FamilleResponse>(`/familles/${uuid}`);
    numericIdByUuid.set(uuid, res.famille.id);
    return res.famille.id;
  } catch {
    return undefined;
  }
}

async function summarize(famille: FamilleApi): Promise<FamilySummary> {
  numericIdByUuid.set(famille.uuid, famille.id);
  const family = toFamily(famille);
  const [membersRes, generation] = await Promise.all([
    apiRequest<PersonnesListResponse>(`/personnes?familleId=${famille.id}&pageSize=100`),
    fetchGenerationDepth(famille),
  ]);
  const members = membersRes.personnes.map(toPerson);
  const generationCount = new Set(members.map((m) => m.generation)).size;
  const livingCount = members.filter((m) => !m.isDeceased).length;
  const ancestor = family.ancestorId ? members.find((m) => m.id === family.ancestorId) : undefined;
  return {
    ...family,
    memberCount: members.length,
    generationCount,
    livingCount,
    locations: locationsFromMembers(members),
    ...(ancestor ? { ancestor } : {}),
    estFondatrice: famille.estFondatrice,
    estFondatriceOrigine: famille.estFondatriceOrigine,
    estActive: !famille.deletedAt,
    generation,
    ...(famille.familleParenteId ? { familleParenteId: famille.familleParenteId } : {}),
  };
}

/** Village-scale trade-off: computing memberCount/generationCount for every
 * family means one extra `/personnes` request per family in the list (no
 * bulk "families with counts" endpoint exists yet). Fine for a village-sized
 * number of families; would need a dedicated backend aggregate for a much
 * larger dataset. */
export async function listFamilies(search?: string): Promise<FamilySummary[]> {
  const res = await apiRequest<FamillesListResponse>(
    `/familles?pageSize=100${search ? `&recherche=${encodeURIComponent(search)}` : ""}`,
  );
  const summaries = await Promise.all(res.familles.map(summarize));
  summaries.sort((a, b) => b.memberCount - a.memberCount);
  cacheFamilies(summaries);
  return summaries;
}

export async function getFamily(id: string): Promise<FamilySummary | undefined> {
  try {
    const res = await apiRequest<FamilleResponse>(`/familles/${id}`);
    const summary = await summarize(res.famille);
    cacheFamilies([summary]);
    return summary;
  } catch {
    return undefined;
  }
}

export async function getFamilyMembers(id: string): Promise<Person[]> {
  const numericId = await resolveFamilleNumericId(id);
  if (numericId === undefined) return [];
  const res = await apiRequest<PersonnesListResponse>(`/personnes?familleId=${numericId}&pageSize=100`);
  return res.personnes.map(toPerson).sort((a, b) => a.generation - b.generation);
}

/** Self, in first position, up to the fondatrice in last position — real
 * `GET /familles/:id/chaine`, never derived client-side. */
export async function getFamilyChain(id: string): Promise<FamilyHierarchyEntry[]> {
  const res = await apiRequest<FamillesHierarchyResponse>(`/familles/${id}/chaine`);
  return (res.chaine ?? []).map((f) => toHierarchyEntry(f));
}

/** One level of direct relative families (children in the `familleParenteId`
 * hierarchy) — real `GET /familles/:id/relatives`. */
export async function getFamilyRelatives(id: string): Promise<FamilyHierarchyEntry[]> {
  const res = await apiRequest<FamillesHierarchyResponse>(`/familles/${id}/relatives`);
  return (res.relatives ?? []).map((f) => toHierarchyEntry(f));
}

/**
 * Toute la descendance d'une famille fondatrice (elle-même incluse, en
 * génération 0), aplatie avec la génération de chacune déjà calculée —
 * utilisé par le formulaire "famille descendante" pour choisir la famille
 * parente directe (fondatrice, ou n'importe laquelle de ses descendantes,
 * quelle que soit sa profondeur). Parcours en largeur niveau par niveau via
 * `GET /familles/:id/relatives`, seul moyen existant de descendre la
 * hiérarchie — même compromis "à l'échelle d'un village" que le reste de ce
 * module (un aller-retour par génération, jamais par famille individuelle).
 */
export async function listFamilyDescendants(fondatriceId: string): Promise<FamilyHierarchyEntry[]> {
  const racineRes = await apiRequest<FamilleResponse>(`/familles/${fondatriceId}`);
  const racine = toHierarchyEntry(racineRes.famille, 0);
  const resultat: FamilyHierarchyEntry[] = [racine];

  let frontiereIds = [fondatriceId];
  let generation = 0;
  while (frontiereIds.length > 0) {
    generation += 1;
    const niveaux = await Promise.all(frontiereIds.map((id) => getFamilyRelatives(id)));
    const enfants = niveaux.flat().map((f) => ({ ...f, generation }));
    resultat.push(...enfants);
    frontiereIds = enfants.map((f) => f.id);
  }

  return resultat;
}

export interface FamilleReelleInput {
  nom: string;
  description?: string;
  histoire?: string;
  devise?: string;
  imageCouverture?: string;
  ancetreId?: number;
  /** `undefined` (champ absent du patch) = ne pas toucher au rattachement
   * actuel ; un nombre = rattacher/déplacer vers cette famille parente ;
   * `null` explicite = couper le rattachement ("détacher"). Les trois cas
   * sont distincts pour le backend (voir famille.validator.ts) — `undefined`
   * disparaît au JSON.stringify, `null` est envoyé tel quel. */
  familleParenteId?: number | null;
}

export async function creerFamilleReelle(input: FamilleReelleInput): Promise<FamilySummary> {
  const res = await apiRequest<FamilleResponse>("/familles", { method: "POST", body: input });
  notifyDataChanged("famille", res.famille.uuid);
  return summarize(res.famille);
}

/** `PUT /familles/:id` is a full replace (no PATCH route) — fetches the
 * current fiche first and merges, mirroring `patchPersonneReelle`. */
export async function modifierFamilleReelle(
  uuid: string,
  patch: Partial<FamilleReelleInput>,
): Promise<FamilySummary> {
  const existingRes = await apiRequest<FamilleResponse>(`/familles/${uuid}`);
  const e = existingRes.famille;
  const merged: FamilleReelleInput = {
    nom: e.nom,
    ...(e.description ? { description: e.description } : {}),
    ...(e.histoire ? { histoire: e.histoire } : {}),
    ...(e.devise ? { devise: e.devise } : {}),
    ...(e.imageCouverture ? { imageCouverture: e.imageCouverture } : {}),
    ...(e.ancetreId ? { ancetreId: e.ancetreId } : {}),
    familleParenteId: e.familleParenteId ?? undefined,
    ...patch,
  };
  const res = await apiRequest<FamilleResponse>(`/familles/${uuid}`, { method: "PUT", body: merged });
  notifyDataChanged("famille", res.famille.uuid);
  return summarize(res.famille);
}

/** Soft-delete only — never a physical delete. The backend rejects (409) if
 * an active personne or an active famille relative still depends on this
 * one; that message is surfaced to the caller as-is, never bypassed. */
export async function desactiverFamilleReelle(uuid: string): Promise<FamilySummary> {
  const res = await apiRequest<FamilleResponse>(`/familles/${uuid}/desactiver`, { method: "POST" });
  notifyDataChanged("famille", res.famille.uuid);
  return summarize(res.famille);
}

export async function restaurerFamilleReelle(uuid: string): Promise<FamilySummary> {
  const res = await apiRequest<FamilleResponse>(`/familles/${uuid}/restaurer`, { method: "POST" });
  notifyDataChanged("famille", res.famille.uuid);
  return summarize(res.famille);
}
