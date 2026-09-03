import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Personne, Famille, Branche } from "@prisma/client";
import * as personneRepository from "@/repositories/personne.repository";
import * as familleRepository from "@/repositories/famille.repository";
import * as brancheRepository from "@/repositories/branche.repository";
import * as personneService from "@/services/personne.service";
import type { CreatePersonneInput, UpdatePersonneInput } from "@/validators/personne.validator";
import type { UtilisateurPublic } from "@/types/utilisateur";

const CREATEUR_ID = 100;

function fakeUtilisateurPublic(overrides: Partial<UtilisateurPublic> = {}): UtilisateurPublic {
  return {
    id: CREATEUR_ID,
    uuid: "44444444-4444-4444-8444-444444444444",
    identifiant: "membre",
    email: "membre@example.com",
    personneId: null,
    actif: true,
    supprime: false,
    supprimeLe: null,
    dernierAcces: null,
    role: "membre",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

// Toute la suite pré-existante ci-dessous teste des règles métier autres que
// la restriction de modification — un admin bypasse toujours cette
// vérification, donc l'utiliser ici garde leur comportement inchangé.
const adminUtilisateur = fakeUtilisateurPublic({ role: "admin" });

/**
 * Pure business-rule tests: every repository is fully mocked, so these never
 * hit a real database. Integration tests against the real `villagedb` live
 * in tests/personne.routes.test.ts.
 */
vi.mock("@/repositories/personne.repository");
vi.mock("@/repositories/famille.repository");
vi.mock("@/repositories/branche.repository");

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

function fakeFamille(overrides: Partial<Famille> = {}): Famille {
  return {
    id: 1,
    uuid: "22222222-2222-4222-8222-222222222222",
    nom: "Famille Diallo",
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

function fakeBranche(overrides: Partial<Branche> = {}): Branche {
  return {
    id: 1,
    uuid: "33333333-3333-4333-8333-333333333333",
    familleId: 1,
    nom: "Branche A",
    description: null,
    statut: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

const baseCreateInput: CreatePersonneInput = {
  prenom: "Amadou",
  nom: "Diallo",
  sexe: "homme",
  familleId: 1,
  forcerCreation: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Les vérifications d'existence (verifierFamilleExiste/verifierBrancheExiste/
  // verifierParentExiste) filtrent désormais deletedAt via findOne, jamais
  // findById (Mission 3) — les deux sont mockés par défaut pour couvrir aussi
  // les autres appels (calculerGeneration, obtenirBruteParUuid) qui, eux,
  // utilisent encore findById/findOne selon leur propre logique.
  vi.mocked(familleRepository.familleRepository.findById).mockResolvedValue(fakeFamille());
  vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(fakeFamille());
  vi.mocked(personneRepository.personneRepository.trouverMatriculeMaxNumero).mockResolvedValue(0);
  vi.mocked(personneRepository.personneRepository.findAll).mockResolvedValue([]);
});

describe("genererMatriculesEnLot", () => {
  it("reads the max matricule once and returns N consecutive matricules", async () => {
    vi.mocked(personneRepository.personneRepository.trouverMatriculeMaxNumero).mockResolvedValue(5);

    const lot = await personneService.genererMatriculesEnLot(3);

    expect(lot).toEqual(["MSD-000006", "MSD-000007", "MSD-000008"]);
    expect(personneRepository.personneRepository.trouverMatriculeMaxNumero).toHaveBeenCalledTimes(
      1,
    );
  });

  it("returns an empty array and skips the DB read when quantite is 0", async () => {
    const lot = await personneService.genererMatriculesEnLot(0);

    expect(lot).toEqual([]);
    expect(personneRepository.personneRepository.trouverMatriculeMaxNumero).not.toHaveBeenCalled();
  });
});

describe("creer", () => {
  it("generates a sequential matricule and generation 0 for a root person", async () => {
    vi.mocked(personneRepository.personneRepository.trouverMatriculeMaxNumero).mockResolvedValue(5);
    vi.mocked(personneRepository.personneRepository.create).mockResolvedValue(fakePersonne());

    await personneService.creer(baseCreateInput, CREATEUR_ID);

    expect(personneRepository.personneRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ matricule: "MSD-000006", generation: 0 }),
    );
  });

  it("computes generation as pereId's generation + 1", async () => {
    // findById (calculerGeneration) et findOne (verifierParentExiste) doivent
    // tous deux résoudre le même père.
    vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
      fakePersonne({ id: 10, generation: 2 }),
    );
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 10, generation: 2 }),
    );
    vi.mocked(personneRepository.personneRepository.create).mockResolvedValue(fakePersonne());

    await personneService.creer({ ...baseCreateInput, pereId: 10 }, CREATEUR_ID);

    expect(personneRepository.personneRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 3 }),
    );
  });

  it("rejects with 404 when familleId doesn't exist", async () => {
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(null);

    await expect(personneService.creer(baseCreateInput, CREATEUR_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(personneRepository.personneRepository.create).not.toHaveBeenCalled();
  });

  it("rejects with 404 when brancheId doesn't exist", async () => {
    vi.mocked(brancheRepository.brancheRepository.findOne).mockResolvedValue(null);

    await expect(
      personneService.creer({ ...baseCreateInput, brancheId: 99 }, CREATEUR_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("accepts a brancheId that exists", async () => {
    vi.mocked(brancheRepository.brancheRepository.findOne).mockResolvedValue(fakeBranche());
    vi.mocked(personneRepository.personneRepository.create).mockResolvedValue(fakePersonne());

    await expect(
      personneService.creer({ ...baseCreateInput, brancheId: 1 }, CREATEUR_ID),
    ).resolves.toBeDefined();
    expect(personneRepository.personneRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ brancheId: 1 }),
    );
  });

  it("rejects with 404 when pereId doesn't exist", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);

    await expect(personneService.creer({ ...baseCreateInput, pereId: 99 }, CREATEUR_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(personneRepository.personneRepository.create).not.toHaveBeenCalled();
  });

  it("rejects with 409 when the telephone is already used by another fiche", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 55 }),
    );

    await expect(
      personneService.creer({ ...baseCreateInput, telephone: "+224600000000" }, CREATEUR_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(personneRepository.personneRepository.create).not.toHaveBeenCalled();
  });

  it("rejects with 409 when the email is already used by another fiche", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 55 }),
    );

    await expect(
      personneService.creer({ ...baseCreateInput, email: "dejapris@example.com" }, CREATEUR_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(personneRepository.personneRepository.create).not.toHaveBeenCalled();
  });

  it("allows creation when telephone/email are not yet used by anyone", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.create).mockResolvedValue(fakePersonne());

    await expect(
      personneService.creer(
        {
          ...baseCreateInput,
          telephone: "+224600000000",
          email: "libre@example.com",
        },
        CREATEUR_ID,
      ),
    ).resolves.toBeDefined();
  });

  it("rejects with 409 when a duplicate exists and forcerCreation is false", async () => {
    vi.mocked(personneRepository.personneRepository.findAll).mockResolvedValue([fakePersonne()]);

    await expect(personneService.creer(baseCreateInput, CREATEUR_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
    });
    expect(personneRepository.personneRepository.create).not.toHaveBeenCalled();
  });

  it("allows creation despite a duplicate when forcerCreation is true", async () => {
    vi.mocked(personneRepository.personneRepository.findAll).mockResolvedValue([fakePersonne()]);
    vi.mocked(personneRepository.personneRepository.create).mockResolvedValue(fakePersonne());

    await expect(
      personneService.creer({ ...baseCreateInput, forcerCreation: true }, CREATEUR_ID),
    ).resolves.toBeDefined();
    expect(personneRepository.personneRepository.create).toHaveBeenCalled();
  });

  it("never sends forcerCreation to the repository", async () => {
    vi.mocked(personneRepository.personneRepository.create).mockResolvedValue(fakePersonne());

    await personneService.creer(baseCreateInput, CREATEUR_ID);

    const [dataArg] = vi.mocked(personneRepository.personneRepository.create).mock.calls[0] ?? [];
    expect(dataArg).not.toHaveProperty("forcerCreation");
  });

  it("retries matricule generation once on a unique-constraint collision", async () => {
    vi.mocked(personneRepository.personneRepository.trouverMatriculeMaxNumero)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    const { Prisma } = await import("@prisma/client");
    const conflit = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["matricule"] },
    });
    vi.mocked(personneRepository.personneRepository.create)
      .mockRejectedValueOnce(conflit)
      .mockResolvedValueOnce(fakePersonne());

    const resultat = await personneService.creer(baseCreateInput, CREATEUR_ID);

    expect(resultat).toBeDefined();
    expect(personneRepository.personneRepository.create).toHaveBeenCalledTimes(2);
  });

  it("reuses the père existant's own famille, ignoring a contradictory input.familleId (Cas D, Mission 3)", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 10, sexe: "homme", familleId: 77 }),
    );
    vi.mocked(personneRepository.personneRepository.create).mockResolvedValue(fakePersonne());

    await personneService.creer({ ...baseCreateInput, familleId: 1, pereId: 10 }, CREATEUR_ID);

    expect(personneRepository.personneRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ familleId: 77 }),
    );
    // input.familleId (1) n'est jamais vérifié — sans intérêt puisqu'il est
    // ignoré : la famille du père fait foi (même règle que auth.service.ts).
    expect(familleRepository.familleRepository.findOne).not.toHaveBeenCalled();
  });
});

describe("modifier", () => {
  const baseUpdateInput: UpdatePersonneInput = {
    prenom: "Amadou",
    nom: "Diallo",
    sexe: "homme",
    familleId: 1,
  };

  it("throws 404 when the person doesn't exist", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);

    await expect(personneService.modifier("nope", baseUpdateInput, adminUtilisateur)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects a pereId change that would create a genealogical cycle", async () => {
    // existante (id 1) is the proposed father's ancestor: proposedParent(id 2).pereId -> 1
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 1 }),
    );
    vi.mocked(personneRepository.personneRepository.findById).mockImplementation((where) => {
      const id = (where as { id: number }).id;
      return Promise.resolve(id === 2 ? fakePersonne({ id: 2, pereId: 1 }) : null);
    });

    await expect(
      personneService.modifier("uuid", { ...baseUpdateInput, pereId: 2 }, adminUtilisateur),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(personneRepository.personneRepository.update).not.toHaveBeenCalled();
  });

  it("recomputes generation when pereId changes", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 1, pereId: null, generation: 0 }),
    );
    vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
      fakePersonne({ id: 5, generation: 4 }),
    );
    vi.mocked(personneRepository.personneRepository.update).mockResolvedValue(fakePersonne());

    await personneService.modifier("uuid", { ...baseUpdateInput, pereId: 5 }, adminUtilisateur);

    expect(personneRepository.personneRepository.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ generation: 5 }),
    );
  });

  it("keeps the existing generation when neither pereId nor mereId changes", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 1, generation: 3, pereId: null, mereId: null }),
    );
    vi.mocked(personneRepository.personneRepository.update).mockResolvedValue(fakePersonne());

    await personneService.modifier("uuid", baseUpdateInput, adminUtilisateur);

    expect(personneRepository.personneRepository.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ generation: 3 }),
    );
  });

  it("rejects a telephone change to a number already used by another fiche", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockImplementation((where) =>
      "uuid" in (where as object)
        ? Promise.resolve(fakePersonne({ id: 1, telephone: "+224600000001" }))
        : Promise.resolve(fakePersonne({ id: 2, telephone: "+224600000002" })),
    );

    await expect(
      personneService.modifier("uuid", { ...baseUpdateInput, telephone: "+224600000002" }, adminUtilisateur),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(personneRepository.personneRepository.update).not.toHaveBeenCalled();
  });

  it("allows re-submitting the person's own unchanged telephone", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockImplementation((where) =>
      "uuid" in (where as object)
        ? Promise.resolve(fakePersonne({ id: 1, telephone: "+224600000001" }))
        : Promise.resolve(null),
    );
    vi.mocked(personneRepository.personneRepository.update).mockResolvedValue(fakePersonne());

    await expect(
      personneService.modifier("uuid", { ...baseUpdateInput, telephone: "+224600000001" }, adminUtilisateur),
    ).resolves.toBeDefined();
  });

  it("renomme la famille fondée quand son fondateur corrige son propre nom", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 1, nom: "Goepoui" }),
    );
    vi.mocked(personneRepository.personneRepository.update).mockResolvedValue(fakePersonne({ nom: "Goepogui" }));
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
      fakeFamille({ id: 9, ancetreId: 1, nom: "Goepoui" }),
    );
    vi.mocked(familleRepository.familleRepository.update).mockResolvedValue(fakeFamille({ id: 9, nom: "Goepogui" }));

    await personneService.modifier("uuid", { ...baseUpdateInput, nom: "Goepogui" }, adminUtilisateur);

    expect(familleRepository.familleRepository.findOne).toHaveBeenCalledWith({ ancetreId: 1, deletedAt: null });
    expect(familleRepository.familleRepository.update).toHaveBeenCalledWith({ id: 9 }, { nom: "Goepogui" });
  });

  it("ne touche pas au nom de famille quand le nom de la personne ne change pas", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 1, nom: "Diallo" }),
    );
    vi.mocked(personneRepository.personneRepository.update).mockResolvedValue(fakePersonne());

    await personneService.modifier("uuid", baseUpdateInput, adminUtilisateur);

    expect(familleRepository.familleRepository.findOne).not.toHaveBeenCalled();
    expect(familleRepository.familleRepository.update).not.toHaveBeenCalled();
  });

  it("ne renomme aucune famille quand la personne renommée n'est fondatrice d'aucune lignée", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 1, nom: "Diallo" }),
    );
    vi.mocked(personneRepository.personneRepository.update).mockResolvedValue(fakePersonne({ nom: "Diallou" }));
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(null);

    await personneService.modifier("uuid", { ...baseUpdateInput, nom: "Diallou" }, adminUtilisateur);

    expect(familleRepository.familleRepository.findOne).toHaveBeenCalledWith({ ancetreId: 1, deletedAt: null });
    expect(familleRepository.familleRepository.update).not.toHaveBeenCalled();
  });
});

describe("peutModifierPersonne — restriction de modification (mission dédiée)", () => {
  const baseUpdateInput: UpdatePersonneInput = {
    prenom: "Amadou",
    nom: "Diallo",
    sexe: "homme",
    familleId: 1,
  };

  // Règle : propre fiche OU personne créée par cet utilisateur OU admin —
  // jamais un lien familial (familleId/pereId/mereId/brancheId).
  it("TEST 1 — autorise un utilisateur à modifier sa propre fiche", () => {
    const personne = fakePersonne({ id: 1, creeParUtilisateurId: null });
    const utilisateur = fakeUtilisateurPublic({ personneId: 1, role: "membre" });

    expect(personneService.peutModifierPersonne(utilisateur, personne)).toBe(true);
  });

  it("TEST 2 — autorise un utilisateur à modifier une personne qu'il a créée", () => {
    const personne = fakePersonne({ id: 2, creeParUtilisateurId: CREATEUR_ID });
    const utilisateur = fakeUtilisateurPublic({ id: CREATEUR_ID, personneId: null, role: "membre" });

    expect(personneService.peutModifierPersonne(utilisateur, personne)).toBe(true);
  });

  it("TEST 3 — refuse un utilisateur sur une personne créée par quelqu'un d'autre", () => {
    const personne = fakePersonne({ id: 2, creeParUtilisateurId: 999 });
    const utilisateur = fakeUtilisateurPublic({ id: CREATEUR_ID, personneId: null, role: "membre" });

    expect(personneService.peutModifierPersonne(utilisateur, personne)).toBe(false);
  });

  it("ne se laisse jamais convaincre par un lien familial (même famille/branche/père/mère)", () => {
    const personne = fakePersonne({
      id: 2,
      familleId: 1,
      brancheId: 5,
      pereId: 3,
      mereId: 4,
      creeParUtilisateurId: 999,
    });
    // Cet utilisateur est le père (id 3) de la personne cible, dans la même
    // famille/branche — rien de tout cela ne doit donner le droit.
    const utilisateur = fakeUtilisateurPublic({ id: CREATEUR_ID, personneId: 3, role: "membre" });

    expect(personneService.peutModifierPersonne(utilisateur, personne)).toBe(false);
  });

  it("TEST 5 — un admin peut toujours modifier, même sans lien avec la personne", () => {
    const personne = fakePersonne({ id: 2, creeParUtilisateurId: 999 });
    const utilisateur = fakeUtilisateurPublic({ id: CREATEUR_ID, personneId: null, role: "admin" });

    expect(personneService.peutModifierPersonne(utilisateur, personne)).toBe(true);
  });

  it("modifier() rejects with 403 when the utilisateur has no right on this personne", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 2, creeParUtilisateurId: 999 }),
    );
    const utilisateur = fakeUtilisateurPublic({ id: CREATEUR_ID, personneId: null, role: "membre" });

    await expect(
      personneService.modifier("uuid", baseUpdateInput, utilisateur),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(personneRepository.personneRepository.update).not.toHaveBeenCalled();
  });

  it("modifier() never leaks a technical error — the message is the human, French one", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 2, creeParUtilisateurId: 999 }),
    );
    const utilisateur = fakeUtilisateurPublic({ id: CREATEUR_ID, personneId: null, role: "membre" });

    await expect(personneService.modifier("uuid", baseUpdateInput, utilisateur)).rejects.toMatchObject({
      message: "Vous ne pouvez pas modifier les informations de cette personne.",
    });
  });

  it("modifier() succeeds for the personne créée par cet utilisateur, before any other business check runs", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 2, familleId: 1, creeParUtilisateurId: CREATEUR_ID }),
    );
    vi.mocked(personneRepository.personneRepository.update).mockResolvedValue(fakePersonne());
    const utilisateur = fakeUtilisateurPublic({ id: CREATEUR_ID, personneId: null, role: "membre" });

    await expect(
      personneService.modifier("uuid", baseUpdateInput, utilisateur),
    ).resolves.toBeDefined();
  });
});

describe("desactiver / restaurer", () => {
  it("désactiver calls softDelete on the resolved internal id", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 7 }),
    );
    vi.mocked(personneRepository.personneRepository.softDelete).mockResolvedValue(fakePersonne());

    await personneService.desactiver("uuid");

    expect(personneRepository.personneRepository.softDelete).toHaveBeenCalledWith({ id: 7 });
  });

  it("restaurer calls restore on the resolved internal id", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 7 }),
    );
    vi.mocked(personneRepository.personneRepository.restore).mockResolvedValue(fakePersonne());

    await personneService.restaurer("uuid");

    expect(personneRepository.personneRepository.restore).toHaveBeenCalledWith({ id: 7 });
  });
});

describe("listerEnfants / listerFratrie / listerConjoints", () => {
  it("listerEnfants delegates to trouverEnfants with the internal id", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 3 }),
    );
    vi.mocked(personneRepository.personneRepository.trouverEnfants).mockResolvedValue([]);

    await personneService.listerEnfants("uuid");

    expect(personneRepository.personneRepository.trouverEnfants).toHaveBeenCalledWith(3);
  });

  it("listerFratrie delegates to trouverFratrie with pereId/mereId", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 3, pereId: 10, mereId: 11 }),
    );
    vi.mocked(personneRepository.personneRepository.trouverFratrie).mockResolvedValue([]);

    await personneService.listerFratrie("uuid");

    expect(personneRepository.personneRepository.trouverFratrie).toHaveBeenCalledWith(3, 10, 11);
  });

  it("listerConjoints delegates to trouverConjoints with the internal id", async () => {
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 3 }),
    );
    vi.mocked(personneRepository.personneRepository.trouverConjoints).mockResolvedValue([]);

    await personneService.listerConjoints("uuid");

    expect(personneRepository.personneRepository.trouverConjoints).toHaveBeenCalledWith(3);
  });
});
