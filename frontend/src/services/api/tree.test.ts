import { describe, expect, it, vi } from "vitest";
import { buildPersonalTree, buildVillageTrees, fetchVillageIndex, type VillageIndex } from "./tree";
import { apiRequest } from "@/lib/api-client";
import type { PersonneApi } from "./mappers";
import type { Person } from "@/types";

vi.mock("@/lib/api-client");

/**
 * Pure unit tests for `buildPersonalTree` — the "Moi" tab's recursive,
 * unbounded tree builder (see the mission this implements: personalized,
 * recursive, dynamic, real-relations-only, no fixed generation limit).
 * `buildIndividualTree` (used by "Tout le village"/"Rechercher une
 * personne", fixed at three tiers) is untouched by this mission and has no
 * tests added here.
 *
 * `VillageIndex` is built locally (`makeIndex`) rather than via
 * `fetchVillageIndex` — same indexing rules (childrenByParentId from
 * fatherId/motherId, spousesByPersonId from real unions), just fed directly
 * with `Person`/uuid-string ids instead of round-tripping through the API's
 * numeric ids and HTTP calls.
 */

function fakePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    matricule: `MSD-${id}`,
    firstName: id,
    lastName: "Test",
    gender: "male",
    isDeceased: false,
    familyId: "famille-1",
    generation: 0,
    branch: "",
    spouseIds: [],
    childrenIds: [],
    siblingIds: [],
    residenceHistory: [],
    isInVillage: true,
    isInGuinea: true,
    visibility: "public",
    isActive: true,
    registeredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type StatutUnion = "marie" | "divorce" | "veuf" | "partenaire";

function makeIndex(people: Person[], unions: { a: string; b: string; statut: StatutUnion }[] = []): VillageIndex {
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
  const addSpouse = (ownerId: string, spouse: Person, statut: StatutUnion) => {
    const list = spousesByPersonId.get(ownerId) ?? [];
    if (statut === "marie" || statut === "partenaire") list.unshift(spouse);
    else list.push(spouse);
    spousesByPersonId.set(ownerId, list);
  };
  for (const { a, b, statut } of unions) {
    const pa = byId.get(a);
    const pb = byId.get(b);
    if (!pa || !pb) continue;
    addSpouse(a, pb, statut);
    addSpouse(b, pa, statut);
  }

  return { people, byId, childrenByParentId, spousesByPersonId };
}

/** Flattens a tree's person ids, depth-first — used to assert on shape
 * without repeating the same nested-object literal in every test. */
function ids(node: ReturnType<typeof buildPersonalTree>): string[] {
  if (!node) return [];
  return [node.person.id, ...node.spouses.map((s) => s.id), ...node.children.flatMap(ids)];
}

function fakePersonneApi(
  overrides: Partial<PersonneApi> & { id: number; uuid: string; prenom: string; nom: string },
): PersonneApi {
  return {
    matricule: null,
    sexe: "homme",
    visibiliteContacts: "public",
    visibiliteProfil: "public",
    estAuVillage: true,
    estEnGuinee: true,
    actif: true,
    generation: 0,
    familleId: 1,
    familleUuid: "famille-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Regression for a real production bug (2026-09): a village member added his
 * wife via "Ajouter mon/ma conjoint·e", but the tree showed him paired with
 * his own father instead. Root cause: `fetchVillageIndex` zipped the
 * backend's raw-order personnes array against the alphabetically-*sorted*
 * `people` array by shared index (`people[i]` for `personnesApi[i]`) to build
 * `byNumericId` — the map `Union.epouxId`/`epouseId` are resolved
 * through. Whenever the two orders differ (always, unless the backend
 * happens to already return alphabetical order), a numeric id resolves to
 * whichever person the sort put at that same position, not to itself.
 */
describe("fetchVillageIndex", () => {
  it("resolves a union's real participants even when the backend's raw list order isn't alphabetical", async () => {
    // Raw order (as `GET /personnes` would return it, e.g. par date de
    // création) deliberately does NOT match alphabetical (nom, prénom)
    // order — that mismatch is exactly what corrupted `byNumericId` before
    // the fix. Only Gaspard↔épouse has a union: no second union to
    // coincidentally cancel the corruption out.
    const maurice = fakePersonneApi({ id: 10, uuid: "uuid-maurice", prenom: "Maurice", nom: "GOEPOUI" });
    const pauline = fakePersonneApi({
      id: 11,
      uuid: "uuid-pauline",
      prenom: "Pauline",
      nom: "GUILAVOGUI",
      sexe: "femme",
    });
    const gaspard = fakePersonneApi({
      id: 12,
      uuid: "uuid-gaspard",
      prenom: "Gaspard",
      nom: "GOEPOUI",
      pereId: 10,
      pereUuid: "uuid-maurice",
    });
    const epouse = fakePersonneApi({
      id: 13,
      uuid: "uuid-epouse",
      prenom: "Nouvelle",
      nom: "DIALLO",
      sexe: "femme",
    });

    vi.mocked(apiRequest).mockImplementation(async (path: string) => {
      if (path.startsWith("/personnes")) {
        return {
          success: true,
          personnes: [maurice, pauline, gaspard, epouse],
          pagination: { page: 1, pageSize: 100, total: 4, totalPages: 1 },
        };
      }
      if (path.startsWith("/unions")) {
        return {
          success: true,
          unions: [{ epouxId: 12, epouseId: 13, statut: "marie" }],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        };
      }
      throw new Error(`unexpected path in test: ${path}`);
    });

    const index = await fetchVillageIndex();

    expect(index.spousesByPersonId.get("uuid-gaspard")?.map((s) => s.id)).toEqual(["uuid-epouse"]);
    expect(index.spousesByPersonId.get("uuid-epouse")?.map((s) => s.id)).toEqual(["uuid-gaspard"]);
    // Maurice has no union in this dataset — a corrupted mapping previously
    // fabricated one for him out of Gaspard/épouse's union data.
    expect(index.spousesByPersonId.get("uuid-maurice")).toBeUndefined();
  });
});

describe("buildPersonalTree", () => {
  it("TEST 1 — A possède B ; A consulte « Moi » → A puis B", () => {
    const a = fakePerson("A");
    const b = fakePerson("B", { fatherId: "A" });
    const index = makeIndex([a, b]);

    const tree = buildPersonalTree("A", index);

    expect(tree?.person.id).toBe("A");
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children[0]?.person.id).toBe("B");
    expect(tree?.children[0]?.children).toHaveLength(0);
  });

  it("TEST 2 — B possède C ; A consulte « Moi » → A → B → C", () => {
    const a = fakePerson("A");
    const b = fakePerson("B", { fatherId: "A" });
    const c = fakePerson("C", { fatherId: "B" });
    const index = makeIndex([a, b, c]);

    const tree = buildPersonalTree("A", index)!;

    expect(tree.person.id).toBe("A");
    expect(tree.children[0]?.person.id).toBe("B");
    expect(tree.children[0]?.children[0]?.person.id).toBe("C");
    expect(tree.children[0]?.children[0]?.children).toHaveLength(0);
  });

  it("TEST 3 — C possède D ; A consulte « Moi » → A → B → C → D (génération supplémentaire automatique)", () => {
    const a = fakePerson("A");
    const b = fakePerson("B", { fatherId: "A" });
    const c = fakePerson("C", { fatherId: "B" });
    const d = fakePerson("D", { fatherId: "C" });
    const index = makeIndex([a, b, c, d]);

    const tree = buildPersonalTree("A", index)!;

    expect(ids(tree)).toEqual(["A", "B", "C", "D"]);
  });

  it("TEST 4 — B consulte « Moi » → A (ascendant) → B → C → D (descendance)", () => {
    const a = fakePerson("A");
    const b = fakePerson("B", { fatherId: "A" });
    const c = fakePerson("C", { fatherId: "B" });
    const d = fakePerson("D", { fatherId: "C" });
    const index = makeIndex([a, b, c, d]);

    const tree = buildPersonalTree("B", index)!;

    expect(tree.person.id).toBe("A");
    expect(tree.children[0]?.person.id).toBe("B");
    expect(tree.children[0]?.children[0]?.person.id).toBe("C");
    expect(tree.children[0]?.children[0]?.children[0]?.person.id).toBe("D");
  });

  it("TEST 5 — C consulte « Moi » → B (ascendant) → C → D (descendance)", () => {
    const b = fakePerson("B");
    const c = fakePerson("C", { fatherId: "B" });
    const d = fakePerson("D", { fatherId: "C" });
    const index = makeIndex([b, c, d]);

    const tree = buildPersonalTree("C", index)!;

    expect(tree.person.id).toBe("B");
    expect(tree.children[0]?.person.id).toBe("C");
    expect(tree.children[0]?.children[0]?.person.id).toBe("D");
  });

  it("TEST 6 — plusieurs enfants : tous doivent apparaître", () => {
    const a = fakePerson("A");
    const b1 = fakePerson("B1", { fatherId: "A" });
    const b2 = fakePerson("B2", { fatherId: "A" });
    const b3 = fakePerson("B3", { fatherId: "A" });
    const index = makeIndex([a, b1, b2, b3]);

    const tree = buildPersonalTree("A", index)!;

    expect(tree.children.map((c) => c.person.id).sort()).toEqual(["B1", "B2", "B3"]);
  });

  it("TEST 7 — un enfant a lui-même plusieurs enfants : parcouru récursivement (profondeur + largeur)", () => {
    const a = fakePerson("A");
    const b = fakePerson("B", { fatherId: "A" });
    const c1 = fakePerson("C1", { fatherId: "B" });
    const c2 = fakePerson("C2", { fatherId: "B" });
    const d1 = fakePerson("D1", { fatherId: "C1" });
    const d2 = fakePerson("D2", { fatherId: "C1" });
    const index = makeIndex([a, b, c1, c2, d1, d2]);

    const tree = buildPersonalTree("A", index)!;
    const bNode = tree.children[0]!;
    const c1Node = bNode.children.find((c) => c.person.id === "C1")!;

    expect(bNode.children.map((c) => c.person.id).sort()).toEqual(["C1", "C2"]);
    expect(c1Node.children.map((c) => c.person.id).sort()).toEqual(["D1", "D2"]);
  });

  it("TEST 8 — conjoint·e réel·le affiché·e en couple", () => {
    const a = fakePerson("A");
    const w = fakePerson("W", { gender: "female" });
    const index = makeIndex([a, w], [{ a: "A", b: "W", statut: "marie" }]);

    const tree = buildPersonalTree("A", index)!;

    expect(tree.spouses.map((s) => s.id)).toEqual(["W"]);
  });

  it("TEST 9 — les enfants d'un couple partent du même nœud que le couple", () => {
    const a = fakePerson("A");
    const w = fakePerson("W", { gender: "female" });
    const b1 = fakePerson("B1", { fatherId: "A", motherId: "W" });
    const b2 = fakePerson("B2", { fatherId: "A", motherId: "W" });
    const index = makeIndex([a, w, b1, b2], [{ a: "A", b: "W", statut: "marie" }]);

    const tree = buildPersonalTree("A", index)!;

    expect(tree.spouses.map((s) => s.id)).toEqual(["W"]);
    expect(tree.children.map((c) => c.person.id).sort()).toEqual(["B1", "B2"]);
  });

  it("TEST 10 — sans conjoint·e ni enfant : arbre propre (Parents → Personne)", () => {
    const a = fakePerson("A");
    const b = fakePerson("B", { fatherId: "A" });
    const index = makeIndex([a, b]);

    const tree = buildPersonalTree("B", index)!;

    expect(tree.person.id).toBe("A");
    expect(tree.children).toHaveLength(1);
    const bNode = tree.children[0]!;
    expect(bNode.person.id).toBe("B");
    expect(bNode.spouses).toHaveLength(0);
    expect(bNode.children).toHaveLength(0);
  });

  it("TEST 11 — une même personne n'est jamais rendue plusieurs fois", () => {
    // Donnée incohérente délibérée : A.fatherId pointe vers C, qui est en
    // réalité un descendant de A (A → B → C), créant une boucle. La chaîne
    // ascendante s'arrête dès qu'elle revoit un id déjà rencontré, et
    // `visited` (déjà peuplé par cette chaîne) empêche B de réapparaître
    // comme "enfant" de A une fois la boucle redescendue jusque-là.
    const a = fakePerson("A", { fatherId: "C" });
    const b = fakePerson("B", { fatherId: "A" });
    const c = fakePerson("C", { fatherId: "B" });
    const index = makeIndex([a, b, c]);

    const tree = buildPersonalTree("A", index)!;
    const allIds = ids(tree);

    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("TEST 12 — une boucle de données ne provoque pas de boucle infinie", () => {
    const a = fakePerson("A", { fatherId: "C" });
    const b = fakePerson("B", { fatherId: "A" });
    const c = fakePerson("C", { fatherId: "B" });
    const index = makeIndex([a, b, c]);

    // N'importe quel point d'entrée sur le cycle doit se résoudre
    // instantanément (pas de récursion infinie) et produire un arbre.
    expect(() => buildPersonalTree("A", index)).not.toThrow();
    expect(() => buildPersonalTree("B", index)).not.toThrow();
    expect(() => buildPersonalTree("C", index)).not.toThrow();
    expect(buildPersonalTree("A", index)).toBeDefined();
  });
});

/**
 * `buildVillageTrees` — "Tout le village", réécrit après un incident réel
 * (2026-09) : Papa Maurice avait deux fils, Gaspard et Paul ; l'ancienne
 * stratégie ("garder l'instantané contenant le plus de personnes") avait
 * fait disparaître Paul, parce que l'instantané de Gaspard (qui montre en
 * plus SON épouse et SES enfants) comptait plus de monde au total que
 * celui de Papa Maurice (qui montre pourtant ses deux fils). Cette
 * réécriture construit un vrai graphe filiation-only par composante
 * familiale — plus aucune comparaison de taille, plus aucune branche
 * choisie au détriment d'une autre.
 */
describe("buildVillageTrees", () => {
  it("TEST A — deux enfants du même parent apparaissent tous les deux (régression Papa Maurice/Gaspard/Paul)", () => {
    const papaMaurice = fakePerson("PapaMaurice", { lastName: "GOEPOUI" });
    const gaspard = fakePerson("Gaspard", { fatherId: "PapaMaurice", lastName: "GOEPOUI" });
    const paul = fakePerson("Paul", { fatherId: "PapaMaurice", lastName: "GOEPOUI" });
    const index = makeIndex([papaMaurice, gaspard, paul]);

    const entries = buildVillageTrees(index.people, index);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.tree.children.map((c) => c.person.id).sort()).toEqual(["Gaspard", "Paul"]);
  });

  it("TESTS B/C — n'importe quel membre de la famille retrouve exactement le même graphe complet, Paul et le conjoint/descendance de Gaspard inclus", () => {
    const papaMaurice = fakePerson("PapaMaurice", { lastName: "GOEPOUI" });
    const pauline = fakePerson("Pauline", { gender: "female", lastName: "GUILAVOGUI" });
    const gaspard = fakePerson("Gaspard", { fatherId: "PapaMaurice", motherId: "Pauline", lastName: "GOEPOUI" });
    const emely = fakePerson("Emely", { gender: "female", lastName: "ONIVOGUI" });
    const jamsato = fakePerson("Jamsato", { fatherId: "Gaspard", motherId: "Emely", lastName: "GOEPOUI" });
    const jamsato1 = fakePerson("Jamsato1", { fatherId: "Gaspard", motherId: "Emely", lastName: "GOEPOUI" });
    const paul = fakePerson("Paul", { fatherId: "PapaMaurice", motherId: "Pauline", lastName: "GOEPOUI" });
    const index = makeIndex(
      [papaMaurice, pauline, gaspard, emely, jamsato, jamsato1, paul],
      [{ a: "PapaMaurice", b: "Pauline", statut: "marie" }],
    );

    const entries = buildVillageTrees(index.people, index);

    // Une seule carte pour toute la famille — pas "l'arbre de Gaspard" et
    // séparément "l'arbre de Papa Maurice" : Tout le village n'est jamais
    // personnalisé par qui consulte la page (voir section 9 de la mission).
    expect(entries).toHaveLength(1);
    const tousLesIds = ids(entries[0]!.tree);
    for (const attendu of ["PapaMaurice", "Pauline", "Gaspard", "Emely", "Jamsato", "Jamsato1", "Paul"]) {
      expect(tousLesIds).toContain(attendu);
    }
  });

  it("TESTS D/H — un descendant à 5 générations de profondeur reste accessible (aucune limite fixe)", () => {
    const papa = fakePerson("Papa", { lastName: "T" });
    const enfant = fakePerson("Enfant", { fatherId: "Papa", lastName: "T" });
    const petitEnfant = fakePerson("PetitEnfant", { fatherId: "Enfant", lastName: "T" });
    const arriere1 = fakePerson("ArrierePetitEnfant", { fatherId: "PetitEnfant", lastName: "T" });
    const arriere2 = fakePerson("ArriereArrierePetitEnfant", { fatherId: "ArrierePetitEnfant", lastName: "T" });
    const index = makeIndex([papa, enfant, petitEnfant, arriere1, arriere2]);

    const entries = buildVillageTrees(index.people, index);

    expect(entries).toHaveLength(1);
    expect(ids(entries[0]!.tree)).toContain("ArriereArrierePetitEnfant");
  });

  it("TEST E — plusieurs branches d'un même ancêtre sont toutes conservées, avec leur propre descendance", () => {
    const ancetre = fakePerson("Ancetre", { lastName: "T" });
    const enfantA = fakePerson("EnfantA", { fatherId: "Ancetre", lastName: "T" });
    const petitFilsA = fakePerson("PetitFilsA", { fatherId: "EnfantA", lastName: "T" });
    const enfantB = fakePerson("EnfantB", { fatherId: "Ancetre", lastName: "T" });
    const petitFilsB = fakePerson("PetitFilsB", { fatherId: "EnfantB", lastName: "T" });
    const enfantC = fakePerson("EnfantC", { fatherId: "Ancetre", lastName: "T" });
    const petitFilsC = fakePerson("PetitFilsC", { fatherId: "EnfantC", lastName: "T" });
    const index = makeIndex([ancetre, enfantA, petitFilsA, enfantB, petitFilsB, enfantC, petitFilsC]);

    const entries = buildVillageTrees(index.people, index);

    expect(entries).toHaveLength(1);
    const idsTrouves = ids(entries[0]!.tree);
    for (const attendu of ["EnfantA", "PetitFilsA", "EnfantB", "PetitFilsB", "EnfantC", "PetitFilsC"]) {
      expect(idsTrouves).toContain(attendu);
    }
  });

  it("TEST F — une même personne n'apparaît jamais deux fois dans une même carte", () => {
    const papaMaurice = fakePerson("PapaMaurice", { lastName: "GOEPOUI" });
    const pauline = fakePerson("Pauline", { gender: "female", lastName: "GUILAVOGUI" });
    const gaspard = fakePerson("Gaspard", { fatherId: "PapaMaurice", motherId: "Pauline", lastName: "GOEPOUI" });
    const paul = fakePerson("Paul", { fatherId: "PapaMaurice", motherId: "Pauline", lastName: "GOEPOUI" });
    const index = makeIndex([papaMaurice, pauline, gaspard, paul]);

    const entries = buildVillageTrees(index.people, index);

    expect(entries).toHaveLength(1);
    const tousLesIds = ids(entries[0]!.tree);
    expect(new Set(tousLesIds).size).toBe(tousLesIds.length);
  });

  it("TEST G — une boucle de données (A→parent de B→parent de C→parent de A) ne provoque pas de boucle infinie", () => {
    const a = fakePerson("A", { fatherId: "C", lastName: "T" });
    const b = fakePerson("B", { fatherId: "A", lastName: "T" });
    const c = fakePerson("C", { fatherId: "B", lastName: "T" });
    const index = makeIndex([a, b, c]);

    expect(() => buildVillageTrees(index.people, index)).not.toThrow();
  });

  it("TEST I — le sujet de la carte est toujours la racine réellement affichée (plus de titre trompeur)", () => {
    const papaMaurice = fakePerson("PapaMaurice", { lastName: "GOEPOUI" });
    const pauline = fakePerson("Pauline", { gender: "female", lastName: "GUILAVOGUI" });
    const gaspard = fakePerson("Gaspard", { fatherId: "PapaMaurice", motherId: "Pauline", lastName: "GOEPOUI" });
    const index = makeIndex([papaMaurice, pauline, gaspard]);

    const entries = buildVillageTrees(index.people, index);

    // Invariant qui rend le bug de titre structurellement impossible : le
    // sujet affiché dans le titre de la carte est TOUJOURS la personne au
    // sommet de l'arbre réellement rendu, jamais choisi séparément.
    expect(entries[0]!.subject.id).toBe(entries[0]!.tree.person.id);
  });

  it("deux familles réellement distinctes gardent chacune leur propre carte", () => {
    const a = fakePerson("A", { lastName: "AAA" });
    const b = fakePerson("B", { fatherId: "A", lastName: "AAA" });
    const x = fakePerson("X", { lastName: "XXX" });
    const y = fakePerson("Y", { fatherId: "X", lastName: "XXX" });
    const index = makeIndex([a, b, x, y]);

    const entries = buildVillageTrees(index.people, index);

    expect(entries.map((e) => e.subject.id).sort()).toEqual(["A", "X"]);
  });

  it("une personne isolée (sans parent ni conjoint ni enfant) garde sa propre carte", () => {
    const solo = fakePerson("Solo", { lastName: "SEUL" });
    const index = makeIndex([solo]);

    const entries = buildVillageTrees(index.people, index);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.subject.id).toBe("Solo");
  });

  it("un conjoint sans enfant commun mais avec une union réelle reste affiché, sans carte en double (régression FANTA/ZEZE)", () => {
    const a = fakePerson("A", { lastName: "T" });
    const w = fakePerson("W", { gender: "female", lastName: "T" });
    const index = makeIndex([a, w], [{ a: "A", b: "W", statut: "marie" }]);

    const entries = buildVillageTrees(index.people, index);

    // Deux personnes isolées par filiation, uniquement liées par une union
    // réelle : une seule carte doit rester (celle qui a été traitée en
    // premier), pas deux cartes redondantes montrant le même couple.
    expect(entries).toHaveLength(1);
    expect(ids(entries[0]!.tree)).toContain("W");
  });

  it("régression FANTA/ZEZE — un·e conjoint·e sans filiation propre n'obtient plus de carte séparée quand il/elle appartient déjà à une vraie famille", () => {
    const kaliva = fakePerson("Kaliva", { lastName: "KOIVOGUI" });
    const massa = fakePerson("Massa", { gender: "female", lastName: "ZOUMANIGUI" });
    const zeze = fakePerson("Zeze", { fatherId: "Kaliva", motherId: "Massa", lastName: "KOIVOGUI" });
    // Fanta n'a ni père ni mère ni enfant enregistré — sa seule trace dans
    // le village est l'union réelle avec Zeze (exactement le cas signalé :
    // Gaétan, l'enfant affiché sous eux deux, n'a en réalité que fatherId
    // renseigné côté base, jamais motherId=Fanta).
    const fanta = fakePerson("Fanta", { gender: "female", lastName: "GROVOGUI" });
    const gaetan = fakePerson("Gaetan", { fatherId: "Zeze", lastName: "KOIVOGUI" });
    const index = makeIndex(
      [kaliva, massa, zeze, fanta, gaetan],
      [{ a: "Zeze", b: "Fanta", statut: "marie" }],
    );

    const entries = buildVillageTrees(index.people, index);

    // Une seule carte pour toute la famille (celle de Kaliva) ; plus de
    // carte séparée "Arbre de FANTA GROVOGUI".
    expect(entries).toHaveLength(1);
    expect(entries[0]?.subject.id).toBe("Kaliva");
    const tousLesIds = ids(entries[0]!.tree);
    for (const attendu of ["Kaliva", "Massa", "Zeze", "Fanta", "Gaetan"]) {
      expect(tousLesIds).toContain(attendu);
    }
  });

  it("ne fusionne jamais une composante qui porte de vraies branches de filiation, même si son sommet a aussi un·e conjoint·e ailleurs", () => {
    // Deux familles réelles et distinctes, reliées entre elles uniquement
    // par une union entre leurs deux "sommets" respectifs — cette union ne
    // doit jamais faire disparaître l'une des deux familles : seule une
    // composante réduite à une personne totalement isolée peut être
    // fusionnée, jamais une composante avec ses propres enfants/parents.
    const a = fakePerson("A", { lastName: "AAA" });
    const b = fakePerson("B", { fatherId: "A", lastName: "AAA" });
    const x = fakePerson("X", { lastName: "XXX" });
    const y = fakePerson("Y", { fatherId: "X", lastName: "XXX" });
    const index = makeIndex([a, b, x, y], [{ a: "A", b: "X", statut: "marie" }]);

    const entries = buildVillageTrees(index.people, index);

    expect(entries.map((e) => e.subject.id).sort()).toEqual(["A", "X"]);
  });
});
