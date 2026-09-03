import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Famille, Personne } from "@prisma/client";
import * as familleRepository from "@/repositories/famille.repository";
import * as personneRepository from "@/repositories/personne.repository";
import * as familleService from "@/services/famille.service";

/**
 * Pure business-rule tests for the famille hierarchy (familleParenteId):
 * existence checks, cycle detection, uuid/estFondatrice enrichment, the
 * relatives/chaine reads, and RBAC's `resoudreUniversFamilial`. Every
 * repository call is mocked — integration coverage against the real
 * `villagedb` lives in tests/famille.routes.test.ts.
 */
vi.mock("@/repositories/famille.repository");
vi.mock("@/repositories/personne.repository");

function fakePersonne(overrides: Partial<Personne> = {}): Personne {
  return {
    id: 1,
    uuid: "aaaaaaaa-2222-4222-8222-222222222222",
    matricule: "MSD-000001",
    prenom: "Amadou",
    nom: "Diallo",
    surnom: null,
    sexe: "homme",
    photo: null,
    dateNaissance: null,
    lieuNaissance: null,
    estDecede: false,
    statutMatrimonial: null,
    profession: null,
    niveauEtudes: null,
    bio: null,
    telephone: null,
    email: null,
    whatsapp: null,
    visibiliteContacts: "membres",
    visibiliteProfil: "public",
    estAuVillage: true,
    estEnGuinee: true,
    actif: true,
    generation: 0,
    brancheId: null,
    familleId: 1,
    pereId: null,
    mereId: null,
    creeParUtilisateurId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function fakeFamille(overrides: Partial<Famille> = {}): Famille {
  return {
    id: 1,
    uuid: "11111111-1111-4111-8111-111111111111",
    nom: "FAMILLE A",
    description: null,
    histoire: null,
    devise: null,
    imageCouverture: null,
    ancetreId: null,
    familleParenteId: null,
    estFondatriceOrigine: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("creer", () => {
  it("creates without familleParenteId (no existence check performed)", async () => {
    vi.mocked(familleRepository.familleRepository.create).mockResolvedValue(fakeFamille());

    await familleService.creer({ nom: "FAMILLE A" });

    expect(familleRepository.familleRepository.findById).not.toHaveBeenCalled();
    expect(familleRepository.familleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ nom: "FAMILLE A" }),
    );
  });

  it("rejects with 404 when familleParenteId doesn't exist", async () => {
    vi.mocked(familleRepository.familleRepository.findById).mockResolvedValue(null);

    await expect(
      familleService.creer({ nom: "FAMILLE B", familleParenteId: 999 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(familleRepository.familleRepository.create).not.toHaveBeenCalled();
  });

  it("creates when familleParenteId exists", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
      fakeFamille({ id: 1 }),
    );
    vi.mocked(familleRepository.familleRepository.create).mockResolvedValue(
      fakeFamille({ id: 2, familleParenteId: 1 }),
    );

    await familleService.creer({ nom: "FAMILLE B", familleParenteId: 1 });

    expect(familleRepository.familleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ familleParenteId: 1 }),
    );
  });

  it("marks a family created without familleParenteId as estFondatriceOrigine=true", async () => {
    vi.mocked(familleRepository.familleRepository.create).mockResolvedValue(fakeFamille());

    await familleService.creer({ nom: "FAMILLE A" });

    expect(familleRepository.familleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ estFondatriceOrigine: true }),
    );
  });

  it("marks a family created with familleParenteId as estFondatriceOrigine=false — a real descendante, never a founding family", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
      fakeFamille({ id: 1 }),
    );
    vi.mocked(familleRepository.familleRepository.create).mockResolvedValue(
      fakeFamille({ id: 2, familleParenteId: 1 }),
    );

    await familleService.creer({ nom: "FAMILLE B", familleParenteId: 1 });

    expect(familleRepository.familleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ estFondatriceOrigine: false }),
    );
  });
});

describe("modifier", () => {
  it("does not re-check familleParenteId when it doesn't change", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
      fakeFamille({ id: 1, familleParenteId: 5 }),
    );
    vi.mocked(familleRepository.familleRepository.update).mockResolvedValue(fakeFamille());

    await familleService.modifier("11111111-1111-4111-8111-111111111111", {
      nom: "FAMILLE A",
      familleParenteId: 5,
    });

    expect(familleRepository.familleRepository.findById).not.toHaveBeenCalled();
  });

  it("rejects with 404 when the new familleParenteId doesn't exist", async () => {
    // findOne sert à la fois à obtenirBruteParUuid (par uuid) et à
    // verifierFamilleParenteExiste (par id, Mission 3) — distinguer les deux.
    vi.mocked(familleRepository.familleRepository.findOne).mockImplementation((where) => {
      const w = where as Record<string, unknown>;
      return Promise.resolve(typeof w.uuid === "string" ? fakeFamille({ id: 1 }) : null);
    });

    await expect(
      familleService.modifier("11111111-1111-4111-8111-111111111111", {
        nom: "FAMILLE A",
        familleParenteId: 999,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(familleRepository.familleRepository.update).not.toHaveBeenCalled();
  });

  it("rejects with 409 when the new familleParenteId would create a cycle", async () => {
    // A (id=1) -> tente de se rattacher à C (id=3), qui remonte déjà jusqu'à A : C -> B -> A.
    const a = fakeFamille({
      id: 1,
      uuid: "aaaaaaaa-1111-4111-8111-111111111111",
      familleParenteId: null,
    });
    const b = fakeFamille({
      id: 2,
      uuid: "bbbbbbbb-1111-4111-8111-111111111111",
      familleParenteId: 1,
    });
    const c = fakeFamille({
      id: 3,
      uuid: "cccccccc-1111-4111-8111-111111111111",
      familleParenteId: 2,
    });

    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(a);
    vi.mocked(familleRepository.familleRepository.findById).mockImplementation((where) =>
      Promise.resolve([a, b, c].find((f) => f.id === (where as { id: number }).id) ?? null),
    );

    await expect(
      familleService.modifier(a.uuid, { nom: "FAMILLE A", familleParenteId: 3 }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(familleRepository.familleRepository.update).not.toHaveBeenCalled();
  });

  it("accepts a valid, non-cyclic familleParenteId change", async () => {
    const a = fakeFamille({ id: 1, familleParenteId: null });
    const b = fakeFamille({ id: 2, familleParenteId: null });

    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(a);
    vi.mocked(familleRepository.familleRepository.findById).mockResolvedValue(b);
    vi.mocked(familleRepository.familleRepository.update).mockResolvedValue(
      fakeFamille({ id: 1, familleParenteId: 2 }),
    );

    await familleService.modifier(a.uuid, { nom: "FAMILLE A", familleParenteId: 2 });

    expect(familleRepository.familleRepository.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ familleParenteId: 2 }),
    );
  });

  it("détache une famille (familleParenteId: null explicite) sans vérification d'existence ni de cycle", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
      fakeFamille({ id: 1, familleParenteId: 5, estFondatriceOrigine: false }),
    );
    vi.mocked(familleRepository.familleRepository.update).mockResolvedValue(
      fakeFamille({ id: 1, familleParenteId: null }),
    );

    await familleService.modifier("11111111-1111-4111-8111-111111111111", {
      nom: "FAMILLE B",
      familleParenteId: null,
    });

    expect(familleRepository.familleRepository.findById).not.toHaveBeenCalled();
    expect(familleRepository.familleRepository.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ familleParenteId: null }),
    );
  });

  it("ne touche jamais estFondatriceOrigine lors d'une détache — la famille reste une descendante", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
      fakeFamille({ id: 1, familleParenteId: 5, estFondatriceOrigine: false }),
    );
    vi.mocked(familleRepository.familleRepository.update).mockResolvedValue(
      fakeFamille({ id: 1, familleParenteId: null, estFondatriceOrigine: false }),
    );

    await familleService.modifier("11111111-1111-4111-8111-111111111111", {
      nom: "FAMILLE B",
      familleParenteId: null,
    });

    const [, dataArg] = vi.mocked(familleRepository.familleRepository.update).mock.calls[0] ?? [];
    expect(dataArg).not.toHaveProperty("estFondatriceOrigine");
  });
});

describe("enrichissement uuid / estFondatrice", () => {
  it("marks a famille with no familleParenteId as fondatrice, with no familleParenteUuid", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
      fakeFamille({ familleParenteId: null }),
    );

    const resultat = await familleService.obtenirParUuid("11111111-1111-4111-8111-111111111111");

    expect(resultat.estFondatrice).toBe(true);
    expect(resultat).not.toHaveProperty("familleParenteUuid");
  });

  it("resolves familleParenteUuid and estFondatrice=false for a famille relative", async () => {
    const parente = fakeFamille({ id: 2, uuid: "22222222-2222-4222-8222-222222222222" });
    const relative = fakeFamille({ id: 1, familleParenteId: 2 });

    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(relative);
    vi.mocked(familleRepository.familleRepository.findAll).mockResolvedValue([parente]);

    const resultat = await familleService.obtenirParUuid(relative.uuid);

    expect(resultat.estFondatrice).toBe(false);
    expect(resultat.familleParenteUuid).toBe(parente.uuid);
  });
});

describe("listerRelatives", () => {
  it("delegates to trouverRelatives with the resolved internal id", async () => {
    const famille = fakeFamille({ id: 1 });
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(famille);
    vi.mocked(familleRepository.familleRepository.trouverRelatives).mockResolvedValue([
      fakeFamille({ id: 2, familleParenteId: 1 }),
    ]);

    const relatives = await familleService.listerRelatives(famille.uuid);

    expect(familleRepository.familleRepository.trouverRelatives).toHaveBeenCalledWith(1);
    expect(relatives).toHaveLength(1);
    expect(relatives[0]?.familleParenteId).toBe(1);
  });
});

describe("obtenirChaine", () => {
  it("returns [soi-même, ..., fondatrice] walking familleParenteId upward", async () => {
    const a = fakeFamille({
      id: 1,
      uuid: "aaaaaaaa-1111-4111-8111-111111111111",
      familleParenteId: null,
    });
    const b = fakeFamille({
      id: 2,
      uuid: "bbbbbbbb-1111-4111-8111-111111111111",
      familleParenteId: 1,
    });
    const c = fakeFamille({
      id: 3,
      uuid: "cccccccc-1111-4111-8111-111111111111",
      familleParenteId: 2,
    });

    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(c);
    vi.mocked(familleRepository.familleRepository.findById).mockImplementation((where) =>
      Promise.resolve([a, b, c].find((f) => f.id === (where as { id: number }).id) ?? null),
    );

    const chaine = await familleService.obtenirChaine(c.uuid);

    expect(chaine.map((f) => f.id)).toEqual([3, 2, 1]);
    expect(chaine.at(-1)?.estFondatrice).toBe(true);
  });

  it("returns just itself when it has no famille parente (déjà fondatrice)", async () => {
    const a = fakeFamille({ id: 1, familleParenteId: null });
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(a);

    const chaine = await familleService.obtenirChaine(a.uuid);

    expect(chaine.map((f) => f.id)).toEqual([1]);
    expect(familleRepository.familleRepository.findById).not.toHaveBeenCalled();
  });
});

describe("resoudreUniversFamilial", () => {
  it("returns 'toutes' for an admin, without touching any repository", async () => {
    const univers = await familleService.resoudreUniversFamilial({ role: "admin", personneId: 42 });

    expect(univers).toBe("toutes");
    expect(familleRepository.familleRepository.findById).not.toHaveBeenCalled();
  });

  it("returns an empty set for a membre with no personneId", async () => {
    const univers = await familleService.resoudreUniversFamilial({
      role: "membre",
      personneId: null,
    });

    expect(univers).not.toBe("toutes");
    expect((univers as Set<number>).size).toBe(0);
  });

  it("returns an empty set when the linked personne can't be found", async () => {
    vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(null);

    const univers = await familleService.resoudreUniversFamilial({
      role: "membre",
      personneId: 99,
    });

    expect((univers as Set<number>).size).toBe(0);
  });

  it("resolves the whole clan under the founding family — cousins included, other clans excluded", async () => {
    // A (fondatrice) -> B, D (relatives de A) -> C (relative de B). L'utilisateur
    // appartient à C : son univers doit couvrir A, B, C, D (tout le clan), pas
    // seulement sa propre chaîne ascendante (A, B, C).
    const a = fakeFamille({ id: 1, familleParenteId: null });
    const b = fakeFamille({ id: 2, familleParenteId: 1 });
    const c = fakeFamille({ id: 3, familleParenteId: 2 });
    const d = fakeFamille({ id: 4, familleParenteId: 1 });
    const zAutreClan = fakeFamille({ id: 99, familleParenteId: null });

    vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
      fakePersonne({ familleId: c.id }),
    );
    vi.mocked(familleRepository.familleRepository.findById).mockImplementation((where) =>
      Promise.resolve(
        [a, b, c, d, zAutreClan].find((f) => f.id === (where as { id: number }).id) ?? null,
      ),
    );
    vi.mocked(familleRepository.familleRepository.trouverRelativesParLot).mockImplementation(
      (ids) =>
        Promise.resolve(
          [a, b, c, d].filter(
            (f) => f.familleParenteId !== null && ids.includes(f.familleParenteId),
          ),
        ),
    );

    const univers = await familleService.resoudreUniversFamilial({ role: "membre", personneId: 1 });

    expect(univers).not.toBe("toutes");
    const ids = univers as Set<number>;
    expect([...ids].sort()).toEqual([1, 2, 3, 4]);
    expect(ids.has(99)).toBe(false);
  });
});

describe("desactiver", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("rejects (409) when an active personne is still rattachée à cette famille", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockImplementation((where) => {
      const w = where as Record<string, unknown>;
      return Promise.resolve(typeof w.uuid === "string" ? fakeFamille({ id: 1 }) : null);
    });
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 10, familleId: 1 }),
    );

    await expect(familleService.desactiver(uuid)).rejects.toMatchObject({ statusCode: 409 });
    expect(familleRepository.familleRepository.softDelete).not.toHaveBeenCalled();
  });

  it("rejects (409) when an active famille relative still depends on it", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockImplementation((where) => {
      const w = where as Record<string, unknown>;
      if (typeof w.uuid === "string") return Promise.resolve(fakeFamille({ id: 1 }));
      if (typeof w.familleParenteId === "number") {
        return Promise.resolve(fakeFamille({ id: 2, familleParenteId: 1 }));
      }
      return Promise.resolve(null);
    });
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);

    await expect(familleService.desactiver(uuid)).rejects.toMatchObject({ statusCode: 409 });
    expect(familleRepository.familleRepository.softDelete).not.toHaveBeenCalled();
  });

  it("succeeds when no active personne nor active famille relative depends on it (régression)", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockImplementation((where) => {
      const w = where as Record<string, unknown>;
      return Promise.resolve(typeof w.uuid === "string" ? fakeFamille({ id: 1 }) : null);
    });
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);
    vi.mocked(familleRepository.familleRepository.softDelete).mockResolvedValue(
      fakeFamille({ id: 1, deletedAt: new Date() }),
    );

    await expect(familleService.desactiver(uuid)).resolves.toBeDefined();
    expect(familleRepository.familleRepository.softDelete).toHaveBeenCalledWith({ id: 1 });
  });

  it("succeeds even when a dependant exists but is already deactivated — le garde-fou ne regarde que les actifs", async () => {
    // Les deux vérifications (`personneRepository.findOne`/`familleRepository.findOne`
    // filtrent deletedAt: null) : un dépendant déjà désactivé ne doit jamais
    // apparaître ici — simulé en renvoyant null, comme le ferait une vraie
    // requête filtrée en base.
    vi.mocked(familleRepository.familleRepository.findOne).mockImplementation((where) => {
      const w = where as Record<string, unknown>;
      return Promise.resolve(typeof w.uuid === "string" ? fakeFamille({ id: 1 }) : null);
    });
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);
    vi.mocked(familleRepository.familleRepository.softDelete).mockResolvedValue(
      fakeFamille({ id: 1, deletedAt: new Date() }),
    );

    await expect(familleService.desactiver(uuid)).resolves.toBeDefined();
  });
});
