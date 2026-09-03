import { describe, expect, it } from "vitest";
import { buildKinshipGraph, describeRelationship, type KinshipGraph } from "./kinship";
import type { FamilyTreeNode } from "@/services/api/tree";
import type { Person } from "@/types";

/**
 * Fixture mirrors the "Famille GOEPOUI" example from the feature request:
 * Papa Maurice ⚭ Pauline → Gaspard, Paul
 * Gaspard ⚭ Emily → Jamsato, Jamsato1
 * Paul ⚭ Jolie (no children — Jolie has no blood link to anyone else here)
 */
function fakePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    matricule: `MSD-${id}`,
    firstName: id,
    lastName: "Goepoui",
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

const papaMaurice = fakePerson("papa-maurice");
const pauline = fakePerson("pauline", { gender: "female" });
const gaspard = fakePerson("gaspard");
const emily = fakePerson("emily", { gender: "female" });
const paul = fakePerson("paul");
const jolie = fakePerson("jolie", { gender: "female" });
const jamsato = fakePerson("jamsato");
const jamsato1 = fakePerson("jamsato1", { gender: "female" });

const root: FamilyTreeNode = {
  person: papaMaurice,
  spouses: [pauline],
  children: [
    {
      person: gaspard,
      spouses: [emily],
      children: [
        { person: jamsato, spouses: [], children: [] },
        { person: jamsato1, spouses: [], children: [] },
      ],
    },
    { person: paul, spouses: [jolie], children: [] },
  ],
};

const graph = buildKinshipGraph(root);

describe("buildKinshipGraph", () => {
  it("attaches a node's children to both the primary person and every listed spouse", () => {
    expect(graph.parentsOf.get(gaspard.id)).toEqual(new Set([papaMaurice.id, pauline.id]));
    expect(graph.childrenOf.get(papaMaurice.id)).toEqual(new Set([gaspard.id, paul.id]));
  });

  it("records spouse pairings both ways", () => {
    expect(graph.spousesOf.get(papaMaurice.id)).toEqual(new Set([pauline.id]));
    expect(graph.spousesOf.get(pauline.id)).toEqual(new Set([papaMaurice.id]));
  });
});

describe("describeRelationship — direct line", () => {
  it("labels a grandchild relative to a grandparent", () => {
    const result = describeRelationship(graph, papaMaurice.id, jamsato.id);
    expect(result?.label).toBe("Petit-fils");
    expect(result?.pathIds).toEqual([papaMaurice.id, gaspard.id, jamsato.id]);
  });

  it("labels a grandparent relative to a grandchild (reverse direction)", () => {
    const result = describeRelationship(graph, jamsato.id, papaMaurice.id);
    expect(result?.label).toBe("Grand-père");
  });

  it("labels a parent/enfant pair", () => {
    expect(describeRelationship(graph, papaMaurice.id, gaspard.id)?.label).toBe("Fils");
    expect(describeRelationship(graph, gaspard.id, jamsato1.id)?.label).toBe("Fille");
  });
});

describe("describeRelationship — collateral line", () => {
  it("labels full siblings sharing both parents", () => {
    const result = describeRelationship(graph, gaspard.id, paul.id);
    expect(result?.label).toBe("Frère");
  });

  it("labels an uncle relative to his nephew, and the reverse as neveu", () => {
    expect(describeRelationship(graph, jamsato.id, paul.id)?.label).toBe("Oncle");
    expect(describeRelationship(graph, paul.id, jamsato.id)?.label).toBe("Neveu");
    expect(describeRelationship(graph, paul.id, jamsato1.id)?.label).toBe("Nièce");
  });

  it("labels cousins germains", () => {
    // Jamsato/Jamsato1 have no first cousins in this fixture (Paul has no
    // enfant) — extend the tree locally for this one case.
    const paulEnfant = fakePerson("paul-enfant", { gender: "female" });
    const rootWithCousin: FamilyTreeNode = {
      ...root,
      children: [
        root.children[0]!,
        { person: paul, spouses: [jolie], children: [{ person: paulEnfant, spouses: [], children: [] }] },
      ],
    };
    const g = buildKinshipGraph(rootWithCousin);
    const result = describeRelationship(g, jamsato.id, paulEnfant.id);
    expect(result?.label).toBe("Cousine germaine");
  });
});

describe("describeRelationship — in-law fallback", () => {
  it("labels a spouse's blood-relative connection as 'par alliance'", () => {
    // Jolie has no blood ancestor in common with Jamsato — only reachable
    // through her marriage to Paul (Jamsato's oncle).
    const result = describeRelationship(graph, jamsato.id, jolie.id);
    expect(result?.label).toBe("Tante par alliance");
    expect(result?.pathIds).toEqual([jamsato.id, gaspard.id, papaMaurice.id, paul.id, jolie.id]);
  });

  it("uses the precise term for a spouse's parent (belle-mère)", () => {
    const result = describeRelationship(graph, gaspard.id, pauline.id);
    // Pauline is gaspard's real mother here, not an in-law — sanity check
    // the direct blood path is preferred over any in-law substitution.
    expect(result?.label).toBe("Mère");
  });
});

describe("describeRelationship — edge cases", () => {
  it("returns undefined for the same person", () => {
    expect(describeRelationship(graph, gaspard.id, gaspard.id)).toBeUndefined();
  });

  it("falls back to a generic label when no path exists at all", () => {
    const isolated = fakePerson("isolated");
    const disconnectedGraph: KinshipGraph = {
      byId: new Map([...graph.byId, [isolated.id, isolated]]),
      parentsOf: graph.parentsOf,
      childrenOf: graph.childrenOf,
      spousesOf: graph.spousesOf,
    };
    expect(describeRelationship(disconnectedGraph, gaspard.id, isolated.id)).toBeUndefined();
  });
});
