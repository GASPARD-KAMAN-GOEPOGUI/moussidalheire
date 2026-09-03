import type { FamilyTreeNode } from "@/services/api/tree";
import type { Gender, Person } from "@/types";

/**
 * Undirected kinship graph built strictly from what one specific tree
 * renders (see `treeLayout.ts`/`TreeEdges.tsx`), never from a person's raw
 * `fatherId`/`motherId` — so a computed path always lines up with real
 * rendered cards/edges and never reaches outside the currently displayed
 * family (see the product decision: comparisons are scoped to "cet arbre").
 *
 * A node's children are treated as children of BOTH its primary person and
 * every listed spouse — exactly what the tree visually implies by showing
 * them side by side above the same children row. Known limitation inherited
 * from the tree itself: under polygamie, several épouses sharing one node
 * all get listed as "parent" of every child shown below that node, since the
 * rendered tree doesn't distinguish which wife bore which child either.
 */
export interface KinshipGraph {
  byId: Map<string, Person>;
  parentsOf: Map<string, Set<string>>;
  childrenOf: Map<string, Set<string>>;
  spousesOf: Map<string, Set<string>>;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

export function buildKinshipGraph(root: FamilyTreeNode): KinshipGraph {
  const byId = new Map<string, Person>();
  const parentsOf = new Map<string, Set<string>>();
  const childrenOf = new Map<string, Set<string>>();
  const spousesOf = new Map<string, Set<string>>();

  function walk(node: FamilyTreeNode): void {
    byId.set(node.person.id, node.person);
    const parentIds = [node.person.id];
    for (const spouse of node.spouses) {
      byId.set(spouse.id, spouse);
      addToSetMap(spousesOf, node.person.id, spouse.id);
      addToSetMap(spousesOf, spouse.id, node.person.id);
      parentIds.push(spouse.id);
    }
    for (const child of node.children) {
      for (const parentId of parentIds) {
        addToSetMap(parentsOf, child.person.id, parentId);
        addToSetMap(childrenOf, parentId, child.person.id);
      }
      walk(child);
    }
  }
  walk(root);
  return { byId, parentsOf, childrenOf, spousesOf };
}

interface Climb {
  distance: Map<string, number>;
  /** ancestorId -> the child id one step below it, on the climb from `startId` */
  predecessor: Map<string, string>;
}

function climbAncestors(startId: string, graph: KinshipGraph): Climb {
  const distance = new Map<string, number>([[startId, 0]]);
  const predecessor = new Map<string, string>();
  let frontier = [startId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const current of frontier) {
      const d = distance.get(current)!;
      for (const parentId of graph.parentsOf.get(current) ?? []) {
        if (!distance.has(parentId)) {
          distance.set(parentId, d + 1);
          predecessor.set(parentId, current);
          next.push(parentId);
        }
      }
    }
    frontier = next;
  }
  return { distance, predecessor };
}

/** Descends from `ancestorId` back down to `startId` using the climb's
 * predecessor map — returns `[ancestorId, ..., startId]`. */
function pathDownFrom(ancestorId: string, startId: string, predecessor: Map<string, string>): string[] {
  const path = [ancestorId];
  let current = ancestorId;
  while (current !== startId) {
    current = predecessor.get(current)!;
    path.push(current);
  }
  return path;
}

function bestCommonAncestor(
  distA: Map<string, number>,
  distB: Map<string, number>,
): { id: string; distA: number; distB: number } | undefined {
  let best: { id: string; distA: number; distB: number } | undefined;
  for (const [id, da] of distA) {
    const db = distB.get(id);
    if (db === undefined) continue;
    if (
      !best ||
      da + db < best.distA + best.distB ||
      (da + db === best.distA + best.distB && Math.abs(da - db) < Math.abs(best.distA - best.distB))
    ) {
      best = { id, distA: da, distB: db };
    }
  }
  return best;
}

/** Any path at all between two people over the combined graph (filiation in
 * both directions + unions) — used only as a last-resort fallback when no
 * common ancestor exists, so the tree can still highlight a connecting
 * chemin even without a precise kinship label. */
function shortestPathAny(startId: string, targetId: string, graph: KinshipGraph): string[] | undefined {
  if (startId === targetId) return [startId];
  const visited = new Set<string>([startId]);
  const predecessor = new Map<string, string>();
  let frontier = [startId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const current of frontier) {
      const neighbors = [
        ...(graph.parentsOf.get(current) ?? []),
        ...(graph.childrenOf.get(current) ?? []),
        ...(graph.spousesOf.get(current) ?? []),
      ];
      for (const n of neighbors) {
        if (visited.has(n)) continue;
        visited.add(n);
        predecessor.set(n, current);
        if (n === targetId) {
          const path = [targetId];
          let cur = targetId;
          while (cur !== startId) {
            cur = predecessor.get(cur)!;
            path.push(cur);
          }
          return path.reverse();
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return undefined;
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** n=1 -> "", n=2 -> "grand-", n=3 -> "arrière-grand-", n=4 -> "arrière-arrière-grand-"… */
function ancestorPrefix(n: number): string {
  return n <= 1 ? "" : "arrière-".repeat(n - 2) + "grand-";
}

/** n=1 -> "", n=2 -> "petit-", n=3 -> "arrière-petit-"… */
function descendantPrefix(n: number): string {
  return n <= 1 ? "" : "arrière-".repeat(n - 2) + "petit-";
}

type RelationKind =
  | { type: "ancestor"; n: number }
  | { type: "descendant"; n: number }
  | { type: "sibling"; full: boolean }
  | { type: "avuncular"; depth: number; senior: boolean }
  | { type: "cousin"; degree: number; removed: number };

function renderBlood(kind: RelationKind, gender: Gender): string {
  const male = gender === "male";
  switch (kind.type) {
    case "ancestor":
      return capitalize(ancestorPrefix(kind.n) + (male ? "père" : "mère"));
    case "descendant":
      return capitalize(descendantPrefix(kind.n) + (male ? "fils" : "fille"));
    case "sibling":
      if (kind.full) return male ? "Frère" : "Sœur";
      return male ? "Demi-frère" : "Demi-sœur";
    case "avuncular":
      if (kind.senior) return capitalize(ancestorPrefix(kind.depth - 1) + (male ? "oncle" : "tante"));
      return capitalize(descendantPrefix(kind.depth - 1) + (male ? "neveu" : "nièce"));
    case "cousin": {
      const base = male ? "Cousin" : "Cousine";
      if (kind.degree === 1) {
        if (kind.removed === 0) return male ? "Cousin germain" : "Cousine germaine";
        return `${base} issu de germain`;
      }
      const suffix = kind.removed > 0 ? " (issu de germain)" : "";
      return `${base} au ${kind.degree}ᵉ degré${suffix}`;
    }
  }
}

/** Rewrites a blood relation into its "par alliance" (in-law) counterpart —
 * precise well-known nouns for the most common cases (parent/enfant/frère et
 * sœur), a plain "{terme} par alliance" suffix everywhere else (oncle,
 * grands-parents, cousins…) — still perfectly clear, if less idiomatic than
 * the rare exact term. */
function renderInLaw(kind: RelationKind, gender: Gender): string {
  const male = gender === "male";
  if (kind.type === "ancestor" && kind.n === 1) return male ? "Beau-père" : "Belle-mère";
  if (kind.type === "descendant" && kind.n === 1) return male ? "Gendre" : "Belle-fille";
  if (kind.type === "sibling") return male ? "Beau-frère" : "Belle-sœur";
  return `${renderBlood(kind, gender)} par alliance`;
}

interface KindWithPath {
  kind: RelationKind;
  pathIds: string[];
}

/** The blood relation of `bId` relative to `aId`, or `undefined` when no
 * ancestor common to both exists within this graph. */
function bloodRelationKind(graph: KinshipGraph, aId: string, bId: string): KindWithPath | undefined {
  if (aId === bId) return undefined;
  const climbA = climbAncestors(aId, graph);
  const climbB = climbAncestors(bId, graph);
  const common = bestCommonAncestor(climbA.distance, climbB.distance);
  if (!common) return undefined;

  const { id: lcaId, distA, distB } = common;
  const aSide = pathDownFrom(lcaId, aId, climbA.predecessor).reverse();
  const bSide = pathDownFrom(lcaId, bId, climbB.predecessor);
  const pathIds = [...aSide, ...bSide.slice(1)];

  let kind: RelationKind;
  if (distA === 0) {
    kind = { type: "descendant", n: distB };
  } else if (distB === 0) {
    kind = { type: "ancestor", n: distA };
  } else if (distA === 1 && distB === 1) {
    const parentsA = graph.parentsOf.get(aId) ?? new Set<string>();
    const parentsB = graph.parentsOf.get(bId) ?? new Set<string>();
    let shared = 0;
    for (const p of parentsA) if (parentsB.has(p)) shared++;
    kind = { type: "sibling", full: shared >= 2 };
  } else if (distA === 1 || distB === 1) {
    const senior = distB === 1;
    const depth = senior ? distA : distB;
    kind = { type: "avuncular", depth, senior };
  } else {
    kind = { type: "cousin", degree: Math.min(distA, distB) - 1, removed: Math.abs(distA - distB) };
  }

  return { kind, pathIds };
}

export interface KinshipResult {
  /** Décrit le lien de la deuxième personne (B) par rapport à la première (A). */
  label: string;
  pathIds: string[];
  /** Vrai quand aucun terme précis n'a pu être établi (lien par alliance
   * trouvé plus loin dans le graphe) — le chemin reste surligné, mais le
   * libellé reste générique. */
  approximate?: boolean;
}

/**
 * Décrit le lien entre deux personnes de l'arbre actuellement affiché, et
 * fournit la liste ordonnée des identifiants du chemin qui les relie (pour
 * le surlignage). Cherche d'abord un ancêtre commun par le sang ; à défaut,
 * essaie un lien par alliance en substituant B (ou A) par l'un·e de ses
 * conjoint·e·s ; à défaut, se rabat sur n'importe quel chemin du graphe
 * combiné, avec un libellé générique.
 */
export function describeRelationship(
  graph: KinshipGraph,
  aId: string,
  bId: string,
): KinshipResult | undefined {
  if (aId === bId) return undefined;
  const personB = graph.byId.get(bId);
  if (!graph.byId.has(aId) || !personB) return undefined;

  const blood = bloodRelationKind(graph, aId, bId);
  if (blood) return { label: renderBlood(blood.kind, personB.gender), pathIds: blood.pathIds };

  for (const spouseOfBId of graph.spousesOf.get(bId) ?? []) {
    const viaSpouse = bloodRelationKind(graph, aId, spouseOfBId);
    if (viaSpouse) {
      return { label: renderInLaw(viaSpouse.kind, personB.gender), pathIds: [...viaSpouse.pathIds, bId] };
    }
  }
  for (const spouseOfAId of graph.spousesOf.get(aId) ?? []) {
    const viaSpouse = bloodRelationKind(graph, spouseOfAId, bId);
    if (viaSpouse) {
      return { label: renderInLaw(viaSpouse.kind, personB.gender), pathIds: [aId, ...viaSpouse.pathIds] };
    }
  }

  const anyPath = shortestPathAny(aId, bId, graph);
  if (anyPath) return { label: "Lien par alliance", pathIds: anyPath, approximate: true };
  return undefined;
}
