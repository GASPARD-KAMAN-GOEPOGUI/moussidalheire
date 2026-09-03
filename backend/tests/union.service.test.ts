import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Personne, Union } from "@prisma/client";
import * as unionRepository from "@/repositories/union.repository";
import * as personneRepository from "@/repositories/personne.repository";
import * as unionService from "@/services/union.service";
import type { CreateUnionInput, UpdateUnionInput } from "@/validators/union.validator";

/** Pure business-rule test: the repositories are fully mocked, never hit a
 * real database. Integration coverage against the real `villagedb` lives in
 * tests/union.routes.test.ts. `personne.repository` is mocked too because
 * `creer`/`modifier` now verify both personnes actually exist (via
 * `verifierPersonneExiste`, shared with `personne.service.ts`) before
 * touching the union — a union can no longer dangle off a deleted or
 * non-existent personne. */
vi.mock("@/repositories/union.repository");
vi.mock("@/repositories/personne.repository");

function fakeUnion(overrides: Partial<Union> = {}): Union {
  return {
    id: 1,
    uuid: "44444444-4444-4444-8444-444444444444",
    epouxId: 1,
    epouseId: 2,
    statut: "marie",
    dateDebut: null,
    dateFin: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function fakePersonne(overrides: Partial<Personne> = {}): Personne {
  return {
    id: 1,
    uuid: "11111111-1111-4111-8111-111111111111",
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(fakePersonne());
});

describe("creer", () => {
  it("rejects with 409 when epouxId === epouseId", async () => {
    const input: CreateUnionInput = { epouxId: 5, epouseId: 5, statut: "marie" };

    await expect(unionService.creer(input)).rejects.toMatchObject({ statusCode: 409 });
    expect(unionRepository.unionRepository.create).not.toHaveBeenCalled();
  });

  it("creates the union when the two people differ", async () => {
    vi.mocked(unionRepository.unionRepository.create).mockResolvedValue(fakeUnion());
    const input: CreateUnionInput = { epouxId: 1, epouseId: 2, statut: "marie" };

    const resultat = await unionService.creer(input);

    expect(resultat).toBeDefined();
    expect(unionRepository.unionRepository.create).toHaveBeenCalledWith(input);
  });

  it("rejects with 404 when epouxId does not exist", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValueOnce(null);
    const input: CreateUnionInput = { epouxId: 999, epouseId: 2, statut: "marie" };

    await expect(unionService.creer(input)).rejects.toMatchObject({ statusCode: 404 });
    expect(unionRepository.unionRepository.create).not.toHaveBeenCalled();
  });

  it("rejects with 404 when epouseId does not exist", async () => {
    vi.mocked(personneRepository.personneRepository.findOne)
      .mockResolvedValueOnce(fakePersonne())
      .mockResolvedValueOnce(null);
    const input: CreateUnionInput = { epouxId: 1, epouseId: 999, statut: "marie" };

    await expect(unionService.creer(input)).rejects.toMatchObject({ statusCode: 404 });
    expect(unionRepository.unionRepository.create).not.toHaveBeenCalled();
  });
});

describe("modifier", () => {
  it("rejects with 409 when the update sets epouxId === epouseId", async () => {
    vi.mocked(unionRepository.unionRepository.findOne).mockResolvedValue(fakeUnion());
    const input: UpdateUnionInput = { epouxId: 5, epouseId: 5, statut: "marie" };

    await expect(unionService.modifier("uuid", input)).rejects.toMatchObject({ statusCode: 409 });
    expect(unionRepository.unionRepository.update).not.toHaveBeenCalled();
  });

  it("updates the union when the two people differ", async () => {
    vi.mocked(unionRepository.unionRepository.findOne).mockResolvedValue(fakeUnion({ id: 7 }));
    vi.mocked(unionRepository.unionRepository.update).mockResolvedValue(fakeUnion());
    const input: UpdateUnionInput = { epouxId: 1, epouseId: 3, statut: "divorce" };

    await unionService.modifier("uuid", input);

    expect(unionRepository.unionRepository.update).toHaveBeenCalledWith({ id: 7 }, input);
  });

  it("rejects with 404 when the new epouseId does not exist", async () => {
    vi.mocked(personneRepository.personneRepository.findOne)
      .mockResolvedValueOnce(fakePersonne())
      .mockResolvedValueOnce(null);
    const input: UpdateUnionInput = { epouxId: 1, epouseId: 999, statut: "marie" };

    await expect(unionService.modifier("uuid", input)).rejects.toMatchObject({ statusCode: 404 });
    expect(unionRepository.unionRepository.update).not.toHaveBeenCalled();
  });
});
