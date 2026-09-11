import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Utilisateur } from "@/models/utilisateur.model";
import * as utilisateursRepository from "@/repositories/utilisateurs.repository";
import * as utilisateursService from "@/services/utilisateurs.service";
import type { CreateUtilisateurInput } from "@/schemas/utilisateurs/create-utilisateur.schema";
import type { UpdateUtilisateurInput } from "@/schemas/utilisateurs/update-utilisateur.schema";
import type { ListUtilisateursQuery } from "@/schemas/utilisateurs/list-utilisateurs.schema";

/**
 * Pure business-rule tests: the repository (the only layer allowed to touch
 * Prisma) is fully mocked, so these never hit a real database. Integration
 * tests against the real `villagedb` live in tests/utilisateurs.routes.test.ts.
 */
vi.mock("@/repositories/utilisateurs.repository");

function fakeUtilisateur(overrides: Partial<Utilisateur> = {}): Utilisateur {
  return {
    id: 1,
    uuid: "11111111-1111-4111-8111-111111111111",
    identifiant: "amadou.diallo",
    email: "amadou@example.com",
    motDePasseHash: "$2b$12$existinghashvalueexistinghashvalue",
    personneId: null,
    actif: true,
    supprime: false,
    supprimeLe: null,
    dernierAcces: null,
    motDePasseModifieLe: null,
    role: "membre",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("creerUtilisateur", () => {
  const input: CreateUtilisateurInput = {
    identifiant: "amadou.diallo",
    motDePasse: "Password123",
  };

  it("hashes the password before persisting it, and never returns it", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiant).mockResolvedValue(null);
    vi.mocked(utilisateursRepository.creer).mockResolvedValue(fakeUtilisateur());

    const result = await utilisateursService.creerUtilisateur(input);

    expect(result).not.toHaveProperty("motDePasseHash");
    expect(utilisateursRepository.creer).toHaveBeenCalledWith(
      expect.objectContaining({
        identifiant: "amadou.diallo",
        motDePasseHash: expect.stringMatching(/^\$2[aby]\$/) as unknown as string,
      }),
    );
    const [createArgs] = vi.mocked(utilisateursRepository.creer).mock.calls[0] ?? [];
    expect(createArgs?.motDePasseHash).not.toBe("Password123");
  });

  it("rejects with a 409 conflict when the identifiant is already used, without writing anything", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiant).mockResolvedValue(fakeUtilisateur());

    await expect(utilisateursService.creerUtilisateur(input)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
    });
    expect(utilisateursRepository.creer).not.toHaveBeenCalled();
  });

  it("rejects with a 409 conflict when the email is already used", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiant).mockResolvedValue(null);
    vi.mocked(utilisateursRepository.trouverParEmail).mockResolvedValue(fakeUtilisateur());

    await expect(
      utilisateursService.creerUtilisateur({ ...input, email: "amadou@example.com" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(utilisateursRepository.creer).not.toHaveBeenCalled();
  });
});

describe("obtenirUtilisateurParUuid", () => {
  it("throws a 404 when no user matches", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(null);

    await expect(
      utilisateursService.obtenirUtilisateurParUuid("does-not-exist"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("never returns motDePasseHash", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(fakeUtilisateur());

    const result = await utilisateursService.obtenirUtilisateurParUuid(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result).not.toHaveProperty("motDePasseHash");
    expect(result.identifiant).toBe("amadou.diallo");
  });
});

describe("listerUtilisateurs", () => {
  const query: ListUtilisateursQuery = {
    page: 1,
    pageSize: 20,
    actif: undefined,
    inclureSupprimes: undefined,
  };

  it("excludes logically-deleted users by default", async () => {
    vi.mocked(utilisateursRepository.lister).mockResolvedValue({ utilisateurs: [], total: 0 });

    await utilisateursService.listerUtilisateurs(query);

    expect(utilisateursRepository.lister).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ supprime: false }) as unknown }),
    );
  });

  it("includes them when inclureSupprimes=true", async () => {
    vi.mocked(utilisateursRepository.lister).mockResolvedValue({ utilisateurs: [], total: 0 });

    await utilisateursService.listerUtilisateurs({ ...query, inclureSupprimes: true });

    const [args] = vi.mocked(utilisateursRepository.lister).mock.calls[0] ?? [];
    expect(args?.where).not.toHaveProperty("supprime");
  });

  it("computes pagination.totalPages from the repository's total count", async () => {
    vi.mocked(utilisateursRepository.lister).mockResolvedValue({ utilisateurs: [], total: 45 });

    const { pagination } = await utilisateursService.listerUtilisateurs({
      page: 2,
      pageSize: 20,
      actif: undefined,
      inclureSupprimes: undefined,
    });

    expect(pagination).toEqual({ page: 2, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("never returns motDePasseHash for any item in the list", async () => {
    vi.mocked(utilisateursRepository.lister).mockResolvedValue({
      utilisateurs: [
        fakeUtilisateur(),
        fakeUtilisateur({ id: 2, uuid: "22222222-2222-4222-8222-222222222222" }),
      ],
      total: 2,
    });

    const { utilisateurs } = await utilisateursService.listerUtilisateurs(query);

    for (const utilisateur of utilisateurs) {
      expect(utilisateur).not.toHaveProperty("motDePasseHash");
    }
  });
});

describe("modifierUtilisateur", () => {
  const input: UpdateUtilisateurInput = { identifiant: "amadou.diallo" };

  it("throws a 404 when the user does not exist", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(null);

    await expect(utilisateursService.modifierUtilisateur("nope", input)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("refuses to edit a deactivated/logically-deleted account", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(
      fakeUtilisateur({ supprime: true }),
    );

    await expect(utilisateursService.modifierUtilisateur("uuid", input)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(utilisateursRepository.modifier).not.toHaveBeenCalled();
  });

  it("rejects a duplicate identifiant on rename", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(fakeUtilisateur());
    vi.mocked(utilisateursRepository.trouverParIdentifiant).mockResolvedValue(
      fakeUtilisateur({ id: 2, identifiant: "nouveau.nom" }),
    );

    await expect(
      utilisateursService.modifierUtilisateur("uuid", { identifiant: "nouveau.nom" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("re-hashes the password only when a new one is provided", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(fakeUtilisateur());
    vi.mocked(utilisateursRepository.modifier).mockResolvedValue(fakeUtilisateur());

    await utilisateursService.modifierUtilisateur("uuid", { ...input, motDePasse: "NouveauPass1" });

    expect(utilisateursRepository.modifier).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        motDePasseHash: expect.stringMatching(/^\$2[aby]\$/) as unknown as string,
      }),
    );
  });

  it("leaves the password hash untouched when motDePasse is omitted", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(fakeUtilisateur());
    vi.mocked(utilisateursRepository.modifier).mockResolvedValue(fakeUtilisateur());

    await utilisateursService.modifierUtilisateur("uuid", input);

    const [, data] = vi.mocked(utilisateursRepository.modifier).mock.calls[0] ?? [];
    expect(data).not.toHaveProperty("motDePasseHash");
  });
});

describe("desactiverUtilisateur", () => {
  it("sets actif=false, supprime=true and stamps supprimeLe", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(fakeUtilisateur());
    vi.mocked(utilisateursRepository.definirEtatCompte).mockResolvedValue(
      fakeUtilisateur({ actif: false, supprime: true, supprimeLe: new Date() }),
    );

    await utilisateursService.desactiverUtilisateur("uuid");

    expect(utilisateursRepository.definirEtatCompte).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        actif: false,
        supprime: true,
        supprimeLe: expect.any(Date) as unknown as Date,
      }),
    );
  });

  it("rejects deactivating an already-deactivated account", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(
      fakeUtilisateur({ actif: false, supprime: true }),
    );

    await expect(utilisateursService.desactiverUtilisateur("uuid")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(utilisateursRepository.definirEtatCompte).not.toHaveBeenCalled();
  });

  it("throws a 404 for a nonexistent user", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(null);

    await expect(utilisateursService.desactiverUtilisateur("nope")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("reactiverUtilisateur", () => {
  it("sets actif=true, supprime=false and clears supprimeLe", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(
      fakeUtilisateur({ actif: false, supprime: true, supprimeLe: new Date() }),
    );
    vi.mocked(utilisateursRepository.definirEtatCompte).mockResolvedValue(fakeUtilisateur());

    await utilisateursService.reactiverUtilisateur("uuid");

    expect(utilisateursRepository.definirEtatCompte).toHaveBeenCalledWith(1, {
      actif: true,
      supprime: false,
      supprimeLe: null,
    });
  });

  it("rejects reactivating an already-active account", async () => {
    vi.mocked(utilisateursRepository.trouverParUuid).mockResolvedValue(fakeUtilisateur());

    await expect(utilisateursService.reactiverUtilisateur("uuid")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(utilisateursRepository.definirEtatCompte).not.toHaveBeenCalled();
  });
});
