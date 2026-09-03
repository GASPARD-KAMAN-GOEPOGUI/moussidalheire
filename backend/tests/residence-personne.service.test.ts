import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lieu, Personne, ResidencePersonne } from "@prisma/client";
import * as residencePersonneRepository from "@/repositories/residence-personne.repository";
import * as personneRepository from "@/repositories/personne.repository";
import * as lieuRepository from "@/repositories/lieu.repository";
import * as residencePersonneService from "@/services/residence-personne.service";
import type {
  CreateResidencePersonneInput,
  UpdateResidencePersonneInput,
} from "@/validators/residence-personne.validator";

/** Pure business-rule test: the repositories are fully mocked, never hit a
 * real database. Integration coverage against the real `villagedb` lives in
 * tests/residence-personne.routes.test.ts. Covers the one real rule this
 * module adds on top of generic CRUD: a personne has at most one résidence
 * marquée `estActuelle` — poser `estActuelle: true` désactive automatiquement
 * l'ancienne. */
vi.mock("@/repositories/residence-personne.repository");
vi.mock("@/repositories/personne.repository");
vi.mock("@/repositories/lieu.repository");

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

function fakeLieu(overrides: Partial<Lieu> = {}): Lieu {
  return {
    id: 1,
    uuid: "22222222-2222-4222-8222-222222222222",
    pays: "Guinée",
    region: null,
    ville: "Moussidalheire",
    quartier: null,
    latitude: null,
    longitude: null,
    estVillage: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function fakeResidence(overrides: Partial<ResidencePersonne> = {}): ResidencePersonne {
  return {
    id: 1,
    uuid: "33333333-3333-4333-8333-333333333333",
    personneId: 1,
    lieuId: 1,
    anneeDebut: null,
    anneeFin: null,
    estActuelle: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(fakePersonne());
  vi.mocked(lieuRepository.lieuRepository.findOne).mockResolvedValue(fakeLieu());
});

describe("creer", () => {
  it("rejects with 404 when personneId does not exist", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValueOnce(null);
    const input: CreateResidencePersonneInput = { personneId: 999, lieuId: 1 };

    await expect(residencePersonneService.creer(input)).rejects.toMatchObject({ statusCode: 404 });
    expect(residencePersonneRepository.residencePersonneRepository.create).not.toHaveBeenCalled();
  });

  it("rejects with 404 when lieuId does not exist", async () => {
    vi.mocked(lieuRepository.lieuRepository.findOne).mockResolvedValueOnce(null);
    const input: CreateResidencePersonneInput = { personneId: 1, lieuId: 999 };

    await expect(residencePersonneService.creer(input)).rejects.toMatchObject({ statusCode: 404 });
    expect(residencePersonneRepository.residencePersonneRepository.create).not.toHaveBeenCalled();
  });

  it("creates without touching any other row when estActuelle is not set", async () => {
    vi.mocked(residencePersonneRepository.residencePersonneRepository.create).mockResolvedValue(
      fakeResidence(),
    );
    const input: CreateResidencePersonneInput = { personneId: 1, lieuId: 1 };

    await residencePersonneService.creer(input);

    expect(residencePersonneRepository.residencePersonneRepository.findOne).not.toHaveBeenCalled();
    expect(residencePersonneRepository.residencePersonneRepository.update).not.toHaveBeenCalled();
  });

  it("unsets the personne's previous résidence actuelle when creating a new one with estActuelle: true", async () => {
    const ancienne = fakeResidence({ id: 7, uuid: "old", estActuelle: true });
    vi.mocked(residencePersonneRepository.residencePersonneRepository.findOne).mockResolvedValue(ancienne);
    vi.mocked(residencePersonneRepository.residencePersonneRepository.create).mockResolvedValue(
      fakeResidence({ id: 8, estActuelle: true }),
    );
    const input: CreateResidencePersonneInput = { personneId: 1, lieuId: 1, estActuelle: true };

    await residencePersonneService.creer(input);

    expect(residencePersonneRepository.residencePersonneRepository.update).toHaveBeenCalledWith(
      { id: 7 },
      { estActuelle: false },
    );
    expect(residencePersonneRepository.residencePersonneRepository.create).toHaveBeenCalledWith(input);
  });

  it("does nothing when estActuelle: true is set but no other current résidence exists yet", async () => {
    vi.mocked(residencePersonneRepository.residencePersonneRepository.findOne).mockResolvedValue(null);
    vi.mocked(residencePersonneRepository.residencePersonneRepository.create).mockResolvedValue(
      fakeResidence({ estActuelle: true }),
    );
    const input: CreateResidencePersonneInput = { personneId: 1, lieuId: 1, estActuelle: true };

    await residencePersonneService.creer(input);

    expect(residencePersonneRepository.residencePersonneRepository.update).not.toHaveBeenCalled();
  });
});

describe("modifier", () => {
  it("excludes the row being updated itself when looking for another current résidence", async () => {
    const existante = fakeResidence({ id: 7, uuid: "uuid-7", estActuelle: true });
    vi.mocked(residencePersonneRepository.residencePersonneRepository.findOne)
      .mockResolvedValueOnce(existante) // obtenirParUuid
      .mockResolvedValueOnce(null); // desactiverAncienneResidenceActuelle finds none besides itself
    vi.mocked(residencePersonneRepository.residencePersonneRepository.update).mockResolvedValue(existante);
    const input: UpdateResidencePersonneInput = { personneId: 1, lieuId: 1, estActuelle: true };

    await residencePersonneService.modifier("uuid-7", input);

    expect(residencePersonneRepository.residencePersonneRepository.findOne).toHaveBeenLastCalledWith({
      personneId: 1,
      estActuelle: true,
      deletedAt: null,
      id: { not: 7 },
    });
    // Only the update call from `modifier` itself — no extra unset call.
    expect(residencePersonneRepository.residencePersonneRepository.update).toHaveBeenCalledTimes(1);
  });

  it("unsets a different row still flagged current for the same personne", async () => {
    const existante = fakeResidence({ id: 7, uuid: "uuid-7", estActuelle: false });
    const autreActuelle = fakeResidence({ id: 9, uuid: "uuid-9", estActuelle: true });
    vi.mocked(residencePersonneRepository.residencePersonneRepository.findOne)
      .mockResolvedValueOnce(existante) // obtenirParUuid
      .mockResolvedValueOnce(autreActuelle); // desactiverAncienneResidenceActuelle
    vi.mocked(residencePersonneRepository.residencePersonneRepository.update).mockResolvedValue(existante);
    const input: UpdateResidencePersonneInput = { personneId: 1, lieuId: 1, estActuelle: true };

    await residencePersonneService.modifier("uuid-7", input);

    expect(residencePersonneRepository.residencePersonneRepository.update).toHaveBeenCalledWith(
      { id: 9 },
      { estActuelle: false },
    );
    expect(residencePersonneRepository.residencePersonneRepository.update).toHaveBeenCalledWith(
      { id: 7 },
      input,
    );
  });

  it("rejects with 404 when moving the residence to a non-existent personneId", async () => {
    vi.mocked(residencePersonneRepository.residencePersonneRepository.findOne).mockResolvedValueOnce(
      fakeResidence({ id: 7, uuid: "uuid-7" }),
    );
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValueOnce(null);
    const input: UpdateResidencePersonneInput = { personneId: 999, lieuId: 1 };

    await expect(residencePersonneService.modifier("uuid-7", input)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(residencePersonneRepository.residencePersonneRepository.update).not.toHaveBeenCalled();
  });
});
