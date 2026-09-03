import { apiRequest } from "@/lib/api-client";
import { toPerson, type PersonneApi } from "./mappers";
import type { Person } from "@/types";

export interface FamilyTreeNode {
  person: Person;
  spouses: Person[];
  children: FamilyTreeNode[];
}

/**
 * Every recensed person's own individual tree, fixed at exactly three tiers —
 * parents (père/mère, if known) → the person + their spouse principale → their
 * direct children — never grandparents, never grandchildren. This mirrors
 * exactly how the "Arbre généalogique" tab is specified: a village is a
 * collection of independent individual trees, never one lineage merged
 * across shared ancestors (see `buildIndividualTree` below). Built purely
 * from `Personne.pereId`/`mereId` and the real `unions` table — no notion of
 * "famille fondatrice/descendante" enters this reasoning at all.
 */
export type IndividualTree = FamilyTreeNode;

type StatutUnionApi = "marie" | "divorce" | "veuf" | "partenaire";

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

interface UnionApi {
  epouxId: number;
  epouseId: number;
  statut: StatutUnionApi;
}

interface UnionsListResponse {
  success: true;
  unions: UnionApi[];
  pagination: PaginationMeta;
}

/** Hard ceiling on how many pages this ever fetches (2000 personnes /
 * unions) — a safety bound, not an expected real size, so a runaway loop
 * can't happen if `pagination.totalPages` were ever wrong. */
const MAX_PAGES = 20;
const PAGE_SIZE = 100;

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; totalPages: number }>,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const { items, totalPages } = await fetchPage(page);
    all.push(...items);
    if (page >= totalPages || page >= MAX_PAGES) break;
    page += 1;
  }
  return all;
}

/**
 * All active, recensed personnes across the whole village — reuses the same
 * `GET /personnes` list endpoint every other screen already calls, just
 * paginated through in full (bounded by `MAX_PAGES`) instead of a single
 * page, since "Tout le village" needs every real person, not just the first
 * 100. No `familleId` filter: the individual-tree model doesn't group people
 * by `famille` at all.
 */
async function fetchAllPersonnes(): Promise<PersonneApi[]> {
  return fetchAllPages(async (page) => {
    const res = await apiRequest<PersonnesListResponse>(`/personnes?page=${page}&pageSize=${PAGE_SIZE}`);
    return { items: res.personnes, totalPages: res.pagination.totalPages };
  });
}

/** All active unions village-wide — same pagination trade-off as
 * `fetchAllPersonnes`, and the only source of truth for "who is whose
 * spouse" (never derived from name/matricule). */
async function fetchAllUnions(): Promise<UnionApi[]> {
  return fetchAllPages(async (page) => {
    const res = await apiRequest<UnionsListResponse>(`/unions?page=${page}&pageSize=${PAGE_SIZE}`);
    return { items: res.unions, totalPages: res.pagination.totalPages };
  });
}

export interface VillageIndex {
  /** Every recensed person, sorted for stable display order. */
  people: Person[];
  byId: Map<string, Person>;
  /** parentId (uuid) → real children (derived from pereId/mereId, exactly
   * like the backend's own `trouverEnfants`). */
  childrenByParentId: Map<string, Person[]>;
  /** personId (uuid) → spouses, active unions (marié/partenaire) first so
   * index 0 is always the "conjointe principale" this simplified display
   * uses (see mission: no multi-spouse UI yet, but no union is ever dropped
   * from the underlying data — this is a display choice only). */
  spousesByPersonId: Map<string, Person[]>;
}

/**
 * Fetches the two real tables an individual tree is ever built from
 * (personnes + unions) in two bounded, paginated request sequences — never
 * one request per person — and indexes them once so every tree (village
 * grid, "Moi", or a searched person) is then derived in memory, at zero
 * extra network cost.
 */
export async function fetchVillageIndex(): Promise<VillageIndex> {
  const [personnesApi, unionsApi] = await Promise.all([fetchAllPersonnes(), fetchAllUnions()]);

  // Built from `personnesApi` (its own order) BEFORE `people` is sorted below
  // — zipping `personnesApi[i]` against the post-sort `people[i]` by shared
  // index would pair each raw numeric id with whichever person happens to
  // land at that same position alphabetically, not with itself.
  const peopleByRawIndex = personnesApi.map(toPerson);
  const byNumericId = new Map(personnesApi.map((raw, i) => [raw.id, peopleByRawIndex[i]!]));

  const people = [...peopleByRawIndex].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
  );
  const byId = new Map(people.map((p) => [p.id, p]));

  const childrenByParentId = new Map<string, Person[]>();
  const addChild = (parentId: string, child: Person) => {
    const list = childrenByParentId.get(parentId);
    if (list) list.push(child);
    else childrenByParentId.set(parentId, [child]);
  };
  for (const person of people) {
    if (person.fatherId) addChild(person.fatherId, person);
    if (person.motherId) addChild(person.motherId, person);
  }

  const spousesByPersonId = new Map<string, Person[]>();
  const addSpouse = (ownerId: string, spouse: Person, statut: StatutUnionApi) => {
    const list = spousesByPersonId.get(ownerId) ?? [];
    if (statut === "marie" || statut === "partenaire") list.unshift(spouse);
    else list.push(spouse);
    spousesByPersonId.set(ownerId, list);
  };
  for (const union of unionsApi) {
    const a = byNumericId.get(union.epouxId);
    const b = byNumericId.get(union.epouseId);
    if (!a || !b) continue;
    addSpouse(a.id, b, union.statut);
    addSpouse(b.id, a, union.statut);
  }

  return { people, byId, childrenByParentId, spousesByPersonId };
}

/**
 * Builds one person's individual tree — never a village-wide/merged tree.
 * Two people who share a father each get this called once, independently:
 * the father appears at the top of both trees (because he genuinely is each
 * one's father), but the two trees are never combined into a single "père
 * avec deux enfants" diagram. Every branch is omitted, never invented, when
 * the underlying relation isn't recorded (no father → no top tier at all;
 * see the mission's "cas de données incomplètes").
 */
export function buildIndividualTree(personId: string, index: VillageIndex): IndividualTree | undefined {
  const person = index.byId.get(personId);
  if (!person) return undefined;

  const children: FamilyTreeNode[] = (index.childrenByParentId.get(person.id) ?? []).map((child) => ({
    person: child,
    spouses: [],
    children: [],
  }));

  const spousePrincipale = index.spousesByPersonId.get(person.id)?.[0];
  const centerNode: FamilyTreeNode = {
    person,
    spouses: spousePrincipale ? [spousePrincipale] : [],
    children,
  };

  const father = person.fatherId ? index.byId.get(person.fatherId) : undefined;
  const mother = person.motherId ? index.byId.get(person.motherId) : undefined;

  if (father) return { person: father, spouses: mother ? [mother] : [], children: [centerNode] };
  if (mother) return { person: mother, spouses: [], children: [centerNode] };
  return centerNode;
}

/** Union-Find (path-compressed) over every père_id/mère_id edge in the
 * village — two people end up in the same "composante familiale" whenever
 * they're linked, directly or through others, by a real filiation relation.
 * Deliberately filiation-only (no `unions` edge here) per this mission's
 * scope: père et mère already end up in the same composante regardless,
 * since they're each linked to their shared enfant. */
class FamilleClusters {
  private readonly parent = new Map<string, string>();

  private ensure(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  private find(id: string): string {
    this.ensure(id);
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = id;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  clusterOf(id: string): string {
    return this.find(id);
  }
}

function dedupliquerParId(personnes: Person[]): Person[] {
  const vues = new Set<string>();
  const resultat: Person[] = [];
  for (const p of personnes) {
    if (!vues.has(p.id)) {
      vues.add(p.id);
      resultat.push(p);
    }
  }
  return resultat;
}

/** Une personne recensée sans père ni mère connu·e dans l'index — le point
 * le plus ancien d'une lignée jusqu'où les données permettent de remonter
 * (jamais une limite arbitraire : simplement "il n'y a rien de plus à
 * remonter ici"). */
function estRacine(p: Person, index: VillageIndex): boolean {
  const pereConnu = p.fatherId !== undefined && index.byId.has(p.fatherId);
  const mereConnue = p.motherId !== undefined && index.byId.has(p.motherId);
  return !pereConnu && !mereConnue;
}

/** Le ou les autres parents des enfants réels de `personId` — déduit
 * uniquement de `pere_id`/`mere_id` des enfants eux-mêmes (jamais des
 * `unions`, hors périmètre de cette mission). Si `personId` a eu des
 * enfants avec plusieurs partenaires, les retourne tous : aucune règle de
 * polygamie n'est appliquée ici, juste ce que la filiation réelle montre. */
function coParentsDesEnfants(personId: string, index: VillageIndex): Person[] {
  const enfants = index.childrenByParentId.get(personId) ?? [];
  const autres: Person[] = [];
  for (const enfant of enfants) {
    const autreId = enfant.fatherId === personId ? enfant.motherId : enfant.motherId === personId ? enfant.fatherId : undefined;
    if (!autreId) continue;
    const autre = index.byId.get(autreId);
    if (autre) autres.push(autre);
  }
  return dedupliquerParId(autres);
}

/** Le ou les conjoint·e·s à afficher pour `personId` — l'union réelle
 * connue (`spousesByPersonId`, jamais modifiée par cette mission) complétée
 * par les co-parents déduits de la filiation de ses enfants (utile quand la
 * relation n'a jamais été saisie comme `Union` mais que la filiation la
 * prouve déjà). Jamais l'inverse : la filiation ne remplace ni ne modifie
 * `unions`, elle ne fait que garantir qu'un vrai co-parent n'est jamais
 * silencieusement absent. */
function conjointsPour(personId: string, index: VillageIndex): Person[] {
  const reels = index.spousesByPersonId.get(personId) ?? [];
  const coParents = coParentsDesEnfants(personId, index);
  return dedupliquerParId([...reels, ...coParents]).filter((p) => p.id !== personId);
}

export interface VillageTreeEntry {
  /** The recensed person this card is actually about (title subject) —
   * the composante familiale's own senior-most root (see `buildVillageTrees`
   * — never chosen by comparing tree sizes). Always equal to `tree.person`. */
  subject: Person;
  tree: FamilyTreeNode;
}

/**
 * "Tout le village" — un graphe familial complet par composante familiale
 * réellement liée (père_id/mère_id), plus jamais un instantané individuel
 * choisi en comparant plusieurs arbres et en gardant "celui qui contient le
 * plus de personnes" (cette stratégie perdait de vraies branches — voir
 * l'incident Paul/Gaspard/Papa Maurice qui a motivé cette réécriture).
 *
 * Pour chaque composante :
 * 1. ses "racines" sont les personnes sans père ni mère connu·e dans cette
 *    composante (`estRacine`) — aussi loin que les données permettent de
 *    remonter, jamais une limite fixe ;
 * 2. la racine avec le plus d'enfants directs devient le sommet affiché ;
 *    les autres racines (typiquement l'autre parent d'un enfant commun)
 *    deviennent ses conjoint·e·s affiché·e·s au même niveau — jamais un
 *    second arbre séparé pour la même composante ;
 * 3. à partir de là, TOUS les enfants réels de chaque personne sont
 *    développés récursivement, sans limite de génération : aucune branche
 *    n'est omise parce qu'une autre branche est plus grande ou plus
 *    "intéressante".
 *
 * `visited` protège contre les doublons et les boucles (une donnée
 * incohérente du type A→parent de B→parent de C→parent de A s'arrête
 * simplement au lieu de tourner indéfiniment — voir TEST G). Ne construit
 * les conjoint·e·s qu'à partir de `unions`/de la filiation réelle
 * (`conjointsPour`) — aucune règle de polygamie n'est ajoutée ou modifiée,
 * conformément au périmètre de cette mission.
 *
 * Une dernière passe retire les cartes redondantes d'une personne dont la
 * SEULE présence dans le village est une union réelle avec quelqu'un
 * d'autre (aucun père/mère/enfant connu de son côté) — elle reste
 * pleinement visible, mais uniquement dans la carte de la famille à
 * laquelle son/sa conjoint·e appartient réellement, jamais en double sous
 * son propre nom (incident FANTA GROVOGUI/ZEZE KOIVOGUI, 2026-09). Ne
 * retire jamais une composante qui porte de vraies branches de filiation :
 * seule une composante réduite à cette unique personne isolée peut être
 * fusionnée ainsi.
 *
 * `buildIndividualTree` reste intact et continue de servir "Rechercher une
 * personne" (hors périmètre) — cette fonction ne l'appelle plus du tout.
 */
export function buildVillageTrees(people: Person[], index: VillageIndex): VillageTreeEntry[] {
  const clusters = new FamilleClusters();
  for (const person of people) {
    if (person.fatherId && index.byId.has(person.fatherId)) clusters.union(person.id, person.fatherId);
    if (person.motherId && index.byId.has(person.motherId)) clusters.union(person.id, person.motherId);
  }

  const byCluster = new Map<string, Person[]>();
  for (const person of people) {
    const clusterId = clusters.clusterOf(person.id);
    const list = byCluster.get(clusterId);
    if (list) list.push(person);
    else byCluster.set(clusterId, [person]);
  }

  /** Une composante réduite à une seule personne, sans père/mère ni enfant
   * connu·e — jamais liée à qui que ce soit par filiation. Distinct d'une
   * "racine" ordinaire (qui peut très bien avoir des enfants) : c'est
   * uniquement ce cas précis qu'`entriesARetenir` ci-dessous peut fusionner
   * dans la carte d'un·e conjoint·e, jamais une composante qui porte de
   * vraies branches. */
  const entriesAvecStatut: { entry: VillageTreeEntry; estCompositeIsolee: boolean }[] = [];

  for (const membres of byCluster.values()) {
    const racines = membres.filter((p) => estRacine(p, index));
    if (racines.length === 0) continue; // ne devrait jamais arriver (donnée incohérente défensive)

    racines.sort(
      (a, b) =>
        (index.childrenByParentId.get(b.id)?.length ?? 0) - (index.childrenByParentId.get(a.id)?.length ?? 0) ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
    const [sommet, ...autresRacines] = racines as [Person, ...Person[]];

    const visited = new Set<string>();

    function buildNode(p: Person, conjointsSupplementaires: Person[] = []): FamilyTreeNode {
      visited.add(p.id);
      const spouses = dedupliquerParId([...conjointsSupplementaires, ...conjointsPour(p.id, index)]).filter(
        (s) => s.id !== p.id,
      );
      for (const s of spouses) visited.add(s.id);

      const children = (index.childrenByParentId.get(p.id) ?? [])
        .filter((enfant) => !visited.has(enfant.id))
        .map((enfant) => buildNode(enfant));

      return { person: p, spouses, children };
    }

    const tree = buildNode(sommet, autresRacines);
    entriesAvecStatut.push({ entry: { subject: sommet, tree }, estCompositeIsolee: membres.length === 1 });
  }

  // Une personne uniquement reliée aux autres par une union réelle (aucun
  // père/mère/enfant connu) — ex. un·e conjoint·e ajouté·e sans enfant
  // commun — obtient sinon sa propre petite carte EN PLUS d'apparaître déjà,
  // correctement, comme conjoint·e dans la carte de la famille à laquelle
  // elle/il est réellement rattaché·e. Les composantes portant de vraies
  // branches de filiation passent toujours en premier, pour que ce
  // rattachement soit reconnu avant qu'on ne décide du sort d'une carte
  // isolée — jamais l'inverse.
  entriesAvecStatut.sort((a, b) => Number(a.estCompositeIsolee) - Number(b.estCompositeIsolee));

  const dejaAffiches = new Set<string>();
  const entries: VillageTreeEntry[] = [];
  for (const { entry, estCompositeIsolee } of entriesAvecStatut) {
    if (estCompositeIsolee && dejaAffiches.has(entry.subject.id)) continue;
    for (const p of collectTreePeople(entry.tree)) dejaAffiches.add(p.id);
    entries.push(entry);
  }

  return entries.sort(
    (a, b) =>
      a.subject.lastName.localeCompare(b.subject.lastName) ||
      a.subject.firstName.localeCompare(b.subject.firstName),
  );
}

/**
 * "Moi" tree — same source data (`VillageIndex`) as `buildIndividualTree`,
 * but recursive and unbounded in both directions instead of fixed at three
 * tiers. Used ONLY by the "Moi" tab (see GenealogyTreePage.tsx); "Tout le
 * village" and "Rechercher une personne" keep calling `buildIndividualTree`
 * unchanged — this function never replaces it.
 *
 * Ascendance: climbs the connected person's own direct lineage (père, sinon
 * mère — exactly `buildIndividualTree`'s one-hop convention, just repeated)
 * up to the oldest recensed ancestor still reachable. Never widens to an
 * ancestor's other children (no uncles/tantes/cousins pulled in) — a single
 * line, matching every diagram in the mission this implements. Cycle-safe
 * (`chainIds`): a père_id/mère_id loop simply stops the climb instead of
 * looping forever.
 *
 * Descendance: once the climb reaches the connected person, expands EVERY
 * real descendant recursively (enfants, petits-enfants, ...) — full breadth
 * at every generation, no depth cap. `visited` (seeded with the whole
 * ascending chain) both prevents infinite loops from a cyclic père_id/mère_id
 * and stops the same person from ever being rendered twice in the same tree.
 *
 * Couples: an ascending node's "spouse" is the other real parent of the next
 * link in the chain (père_id/mère_id — no `unions` lookup needed, exactly
 * like `buildIndividualTree`'s immediate-parents tier). From the connected
 * person downward, "spouse" is their actual recorded union instead (a
 * descendant's spouse isn't a parentage relation).
 */
export function buildPersonalTree(personId: string, index: VillageIndex): FamilyTreeNode | undefined {
  const person = index.byId.get(personId);
  if (!person) return undefined;

  const chain: Person[] = [person];
  const chainIds = new Set<string>([person.id]);
  let current = person;
  for (;;) {
    const nextId = current.fatherId ?? current.motherId;
    const next = nextId ? index.byId.get(nextId) : undefined;
    if (!next || chainIds.has(next.id)) break;
    chain.unshift(next);
    chainIds.add(next.id);
    current = next;
  }

  const visited = new Set<string>(chainIds);

  function buildDescendant(p: Person): FamilyTreeNode {
    visited.add(p.id);
    const spouse = index.spousesByPersonId.get(p.id)?.[0];
    const children = (index.childrenByParentId.get(p.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(buildDescendant);
    return { person: p, spouses: spouse ? [spouse] : [], children };
  }

  function buildChainNode(i: number): FamilyTreeNode {
    const p = chain[i]!;
    if (i === chain.length - 1) return buildDescendant(p);

    // `next` (chain[i + 1]) was reached FROM `p` while climbing (p is
    // necessarily `next.fatherId`, or `next.motherId` when no père was
    // known) — so `p`'s displayed spouse here is simply `next`'s other real
    // parent, when known.
    const next = chain[i + 1]!;
    const spouseStructurel = next.fatherId && next.motherId ? index.byId.get(next.motherId) : undefined;
    if (spouseStructurel) visited.add(spouseStructurel.id);

    return {
      person: p,
      spouses: spouseStructurel ? [spouseStructurel] : [],
      children: [buildChainNode(i + 1)],
    };
  }

  return buildChainNode(0);
}

/** Flattens everyone actually drawn on one individual tree — small (parents
 * + center + spouse + children), used only to feed that tree's own
 * "trouver une personne" search, never a village-wide list. */
export function collectTreePeople(node: FamilyTreeNode): Person[] {
  const people = [node.person, ...node.spouses];
  for (const child of node.children) people.push(...collectTreePeople(child));
  return people;
}
