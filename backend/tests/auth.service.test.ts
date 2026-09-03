import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Personne, Famille, Utilisateur, StatutUnion } from "@prisma/client";
import * as personneRepository from "@/repositories/personne.repository";
import * as familleRepository from "@/repositories/famille.repository";
import * as utilisateursRepository from "@/repositories/utilisateurs.repository";
import * as unionRepository from "@/repositories/union.repository";
import * as emailService from "@/services/email.service";
import { prisma } from "@/config/database";
import * as authService from "@/services/auth.service";
import { hacherMotDePasse, verifierMotDePasse } from "@/utils/password";
import { signerToken, signerRefreshToken } from "@/utils/jwt";
import {
  inscriptionSchema,
  type InscriptionInput,
  type PersonneNouvelleInput,
} from "@/validators/auth.validator";

/**
 * Pure business-rule tests: every repository this flow touches is mocked, so
 * these never hit a real database. Integration tests against the real
 * `villagedb` live in tests/auth.routes.test.ts.
 */
vi.mock("@/repositories/personne.repository");
vi.mock("@/repositories/famille.repository");
vi.mock("@/repositories/branche.repository");
vi.mock("@/repositories/utilisateurs.repository");
vi.mock("@/repositories/union.repository");
vi.mock("@/services/email.service");

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
    email: "amadou@example.com",
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

function fakeUtilisateur(overrides: Partial<Utilisateur> = {}): Utilisateur {
  return {
    id: 10,
    uuid: "33333333-3333-4333-8333-333333333333",
    identifiant: "amadou@example.com",
    email: "amadou@example.com",
    motDePasseHash: "$2b$12$existinghashvalueexistinghashvalue",
    personneId: 1,
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

function fakeUnion(
  overrides: Partial<{ epouxId: number; epouseId: number; statut: StatutUnion }> = {},
) {
  return {
    id: 1,
    uuid: `union-${String(overrides.epouxId)}-${String(overrides.epouseId)}`,
    epouxId: 1,
    epouseId: 2,
    statut: "marie" as StatutUnion,
    dateDebut: null,
    dateFin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

const baseInscriptionInput: InscriptionInput = {
  prenom: "Amadou",
  nom: "Diallo",
  sexe: "homme",
  email: "amadou@example.com",
  familleId: 1,
  forcerCreation: false,
  fratrie: [],
  unions: [],
  enfantsAutres: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // verifierFamilleExiste (Mission 3) filtre deletedAt via findOne, plus findById.
  vi.mocked(familleRepository.familleRepository.findById).mockResolvedValue(fakeFamille());
  vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(fakeFamille());
  vi.mocked(personneRepository.personneRepository.trouverMatriculeMaxNumero).mockResolvedValue(0);
  vi.mocked(personneRepository.personneRepository.findAll).mockResolvedValue([]);
  vi.mocked(utilisateursRepository.trouverParEmail).mockResolvedValue(null);
  vi.mocked(emailService.envoyerEmailBienvenue).mockResolvedValue(undefined);
  vi.mocked(emailService.envoyerEmailInscriptionComplete).mockResolvedValue(undefined);
  vi.mocked(unionRepository.trouverEntreAvecClient).mockResolvedValue(null);
  // Spies on the real (never-connected — see database.ts, lazily connects on
  // first query) prisma client's `$transaction`, rather than mocking the
  // whole `@/config/database` module: the repositories mocked above are
  // themselves auto-mocked from their real module shape, which briefly
  // touches the real `prisma` object at load time — replacing that module
  // wholesale is unnecessary and riskier than just stubbing this one method.
  // Invokes the callback with a placeholder `tx`; the repository writes
  // below are mocked separately and only pass it through to creerAvecClient.
  vi.spyOn(prisma, "$transaction").mockImplementation((callback: unknown) =>
    (callback as (tx: unknown) => Promise<unknown>)({}),
  );
});

describe("inscrire", () => {
  it("creates a personne and a linked utilisateur, and returns a token", async () => {
    vi.mocked(personneRepository.creerAvecClient).mockResolvedValue(fakePersonne());
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());

    const resultat = await authService.inscrire(baseInscriptionInput);

    expect(resultat.personne.id).toBe(1);
    expect(resultat.utilisateur.id).toBe(10);
    expect(typeof resultat.token).toBe("string");
    expect(resultat.token.split(".")).toHaveLength(3); // header.payload.signature
  });

  it("never exposes motDePasseHash on the returned utilisateur", async () => {
    vi.mocked(personneRepository.creerAvecClient).mockResolvedValue(fakePersonne());
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());

    const resultat = await authService.inscrire(baseInscriptionInput);

    expect(resultat.utilisateur).not.toHaveProperty("motDePasseHash");
  });

  it("uses the email as the identifiant, and hashes a random password (never the email itself)", async () => {
    vi.mocked(personneRepository.creerAvecClient).mockResolvedValue(fakePersonne());
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());

    await authService.inscrire(baseInscriptionInput);

    expect(utilisateursRepository.creerAvecClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identifiant: "amadou@example.com",
        email: "amadou@example.com",
        motDePasseHash: expect.stringMatching(/^\$2[aby]\$/) as unknown as string,
      }),
    );
    const [, dataArg] = vi.mocked(utilisateursRepository.creerAvecClient).mock.calls[0] ?? [];
    expect(dataArg?.motDePasseHash).not.toBe("amadou@example.com");
  });

  it("sends the recap email to the registering member after creation, best-effort", async () => {
    vi.mocked(personneRepository.creerAvecClient).mockResolvedValue(fakePersonne());
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());

    await authService.inscrire(baseInscriptionInput);

    expect(emailService.envoyerEmailInscriptionComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        destinataire: "amadou@example.com",
        identifiant: "amadou@example.com",
        comptesCrees: [],
      }),
    );
  });

  it("does not fail the request when the recap email fails to send", async () => {
    vi.mocked(personneRepository.creerAvecClient).mockResolvedValue(fakePersonne());
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());
    vi.mocked(emailService.envoyerEmailInscriptionComplete).mockRejectedValue(new Error("SMTP down"));

    await expect(authService.inscrire(baseInscriptionInput)).resolves.toBeDefined();
  });

  it("lists every person actually created (with a compte) in the registering member's recap email, each with their own role/identifiants", async () => {
    const pere = fakePersonne({ id: 2, prenom: "Amadou", nom: "Diallo", sexe: "homme", matricule: "MSD-000002" });
    const mere = fakePersonne({ id: 3, prenom: "Fatou", nom: "Diallo", sexe: "femme", matricule: "MSD-000003" });
    const membre = fakePersonne({ id: 1, matricule: "MSD-000001" });
    vi.mocked(personneRepository.creerAvecClient)
      .mockResolvedValueOnce(pere)
      .mockResolvedValueOnce(mere)
      .mockResolvedValueOnce(membre);
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());

    await authService.inscrire({
      ...baseInscriptionInput,
      pere: { mode: "nouveau", donnees: nouvellePersonne({ prenom: "Amadou", nom: "Diallo", sexe: "homme" }) },
      mere: { mode: "nouveau", donnees: nouvellePersonne({ prenom: "Fatou", nom: "Diallo", sexe: "femme" }) },
    });

    const [appel] = vi.mocked(emailService.envoyerEmailInscriptionComplete).mock.calls;
    expect(appel?.[0].comptesCrees).toHaveLength(2);
    expect(appel?.[0].comptesCrees).toContainEqual(
      expect.objectContaining({ role: "Père", nomComplet: "Amadou Diallo", matricule: "MSD-000002" }),
    );
    expect(appel?.[0].comptesCrees).toContainEqual(
      expect.objectContaining({ role: "Mère", nomComplet: "Fatou Diallo", matricule: "MSD-000003" }),
    );
  });

  it("also e-mails each created person their own identifiants directly, only when they have their own e-mail", async () => {
    const pereAvecEmail = fakePersonne({
      id: 2,
      prenom: "Amadou",
      nom: "Diallo",
      sexe: "homme",
      email: "pere@example.com",
    });
    const mereSansEmail = fakePersonne({ id: 3, prenom: "Fatou", nom: "Diallo", sexe: "femme", email: null });
    const membre = fakePersonne({ id: 1 });
    vi.mocked(personneRepository.creerAvecClient)
      .mockResolvedValueOnce(pereAvecEmail)
      .mockResolvedValueOnce(mereSansEmail)
      .mockResolvedValueOnce(membre);
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());

    await authService.inscrire({
      ...baseInscriptionInput,
      pere: {
        mode: "nouveau",
        donnees: nouvellePersonne({ prenom: "Amadou", nom: "Diallo", sexe: "homme", email: "pere@example.com" }),
      },
      mere: { mode: "nouveau", donnees: nouvellePersonne({ prenom: "Fatou", nom: "Diallo", sexe: "femme" }) },
    });

    // Le père (a un e-mail) reçoit ses propres identifiants ; la mère (pas
    // d'e-mail) n'en reçoit jamais — seul le membre voit ses identifiants à
    // elle dans son propre récapitulatif.
    expect(emailService.envoyerEmailBienvenue).toHaveBeenCalledTimes(1);
    expect(emailService.envoyerEmailBienvenue).toHaveBeenCalledWith(
      expect.objectContaining({ destinataire: "pere@example.com", prenom: "Amadou" }),
    );
  });

  it("rejects with 409 when the email is already used", async () => {
    vi.mocked(utilisateursRepository.trouverParEmail).mockResolvedValue(fakeUtilisateur());

    await expect(authService.inscrire(baseInscriptionInput)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
  });

  it("rejects with 404 when familleId doesn't exist", async () => {
    vi.mocked(familleRepository.familleRepository.findById).mockResolvedValue(null);
    vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(null);

    await expect(authService.inscrire(baseInscriptionInput)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects with 409 on a duplicate when forcerCreation is false", async () => {
    vi.mocked(personneRepository.personneRepository.findAll).mockResolvedValue([fakePersonne()]);

    await expect(authService.inscrire(baseInscriptionInput)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
  });

  it("computes generation as pereId's generation + 1", async () => {
    vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
      fakePersonne({ id: 99, generation: 3 }),
    );
    // findOne sert aussi aux vérifications téléphone/email (verifierEmailPersonneDisponible) —
    // ne renvoyer le père fictif que pour la recherche par id, jamais pour ces autres formes.
    vi.mocked(personneRepository.personneRepository.findOne).mockImplementation((where) => {
      const w = where as Record<string, unknown>;
      return Promise.resolve(
        typeof w.id === "number" ? fakePersonne({ id: 99, generation: 3 }) : null,
      );
    });
    vi.mocked(personneRepository.creerAvecClient).mockResolvedValue(fakePersonne());
    vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());

    await authService.inscrire({ ...baseInscriptionInput, pere: { mode: "existant", id: 99 } });

    expect(personneRepository.creerAvecClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ generation: 4, pereId: 99 }),
    );
  });

  function nouvellePersonne(overrides: Partial<PersonneNouvelleInput> = {}): PersonneNouvelleInput {
    return { prenom: "Nouveau", nom: "Nouveau", sexe: "homme", ...overrides };
  }

  describe("famille d'origine : père/mère/fratrie", () => {
    let nextId: number;

    beforeEach(() => {
      nextId = 200;
      // Echoes back a Personne reflecting whatever was actually passed to
      // create — needed so assertions can follow relationships (matricule
      // per call, generation propagated to fratrie, etc.) rather than always
      // seeing the same static fixture.
      vi.mocked(personneRepository.creerAvecClient).mockImplementation((_tx, data) =>
        Promise.resolve(
          fakePersonne({
            id: nextId++,
            matricule: data.matricule as string,
            prenom: data.prenom,
            nom: data.nom,
            sexe: data.sexe,
            generation: data.generation ?? 0,
            pereId: (data.pereId as number | undefined) ?? null,
            mereId: (data.mereId as number | undefined) ?? null,
          }),
        ),
      );
      vi.mocked(personneRepository.mettreAJourAvecClient).mockImplementation((_tx, where, data) =>
        Promise.resolve(
          fakePersonne({
            id: (where as { id: number }).id,
            pereId: (data.pereId as number | undefined) ?? null,
            mereId: (data.mereId as number | undefined) ?? null,
            generation: (data.generation as number | undefined) ?? 0,
          }),
        ),
      );
      vi.mocked(utilisateursRepository.creerAvecClient).mockResolvedValue(fakeUtilisateur());
      // verifierParentExiste/verifierPersonneExiste (Mission 3) résolvent
      // désormais via findOne({id, deletedAt:null}), plus findById — délègue
      // vers le mock findById déjà configuré par chaque test ci-dessous
      // (mockResolvedValue ou mockImplementation par id) au lieu de dupliquer
      // sa configuration ; retombe sur null pour les recherches
      // téléphone/email (verifierTelephoneDisponible/verifierEmailPersonneDisponible),
      // qui n'utilisent jamais `id` — comportement par défaut inchangé pour elles.
      vi.mocked(personneRepository.personneRepository.findOne).mockImplementation((where) => {
        const w = where as Record<string, unknown>;
        if (typeof w.id === "number") {
          return personneRepository.personneRepository.findById({ id: w.id });
        }
        return Promise.resolve(null);
      });
    });

    it("rejects with 409 when two people in the same submission share a telephone", async () => {
      await expect(
        authService.inscrire({
          ...baseInscriptionInput,
          telephone: "+224600000000",
          pere: {
            mode: "nouveau",
            donnees: nouvellePersonne({
              prenom: "Pere",
              nom: "Diallo",
              sexe: "homme",
              telephone: "+224600000000",
            }),
          },
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
    });

    it("rejects with 409 when a telephone is already used by an existing fiche", async () => {
      vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
        fakePersonne({ id: 66, telephone: "+224611111111" }),
      );

      await expect(
        authService.inscrire({ ...baseInscriptionInput, telephone: "+224611111111" }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
    });

    it("creates père and mère on the fly with generation 0, the member at generation 1, distinct matricules, and unites père+mère (TEST 9)", async () => {
      const resultat = await authService.inscrire({
        ...baseInscriptionInput,
        pere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Pere", nom: "Diallo", sexe: "homme" }),
        },
        mere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Mere", nom: "Diallo", sexe: "femme" }),
        },
      });

      expect(resultat.pere?.cree).toBe(true);
      expect(resultat.mere?.cree).toBe(true);
      expect(resultat.personne.generation).toBe(1);

      const matricules = vi
        .mocked(personneRepository.creerAvecClient)
        .mock.calls.map(([, data]) => data.matricule);
      expect(new Set(matricules).size).toBe(matricules.length); // all distinct
      expect(matricules).toHaveLength(3); // père, mère, membre

      expect(personneRepository.creerAvecClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ generation: 0, sexe: "homme" }),
      );
      expect(personneRepository.creerAvecClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ generation: 0, sexe: "femme" }),
      );

      // Père et mère sont, de fait, conjoints — jamais deux personnes
      // indépendantes sans lien entre elles.
      expect(unionRepository.creerAvecClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ statut: "marie" }),
      );
    });

    it("does not duplicate Union(père, mère) when one already exists", async () => {
      vi.mocked(unionRepository.trouverEntreAvecClient).mockResolvedValue(fakeUnion());

      await authService.inscrire({
        ...baseInscriptionInput,
        pere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Pere", nom: "Diallo", sexe: "homme" }),
        },
        mere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Mere", nom: "Diallo", sexe: "femme" }),
        },
      });

      expect(unionRepository.creerAvecClient).not.toHaveBeenCalled();
    });

    it("rejects with 404 when an existing pere id doesn't exist", async () => {
      vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(null);

      await expect(
        authService.inscrire({ ...baseInscriptionInput, pere: { mode: "existant", id: 999 } }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects with 409 when an existing pere reference points at a personne of sexe femme", async () => {
      vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
        fakePersonne({ id: 50, sexe: "femme" }),
      );

      await expect(
        authService.inscrire({ ...baseInscriptionInput, pere: { mode: "existant", id: 50 } }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
    });

    describe("rattachement familial intelligent (mission 2)", () => {
      it("reuses the père existant's own famille for the membre, ignoring a different input.familleId (TEST 1)", async () => {
        vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
          fakePersonne({ id: 50, sexe: "homme", familleId: 77 }),
        );

        await authService.inscrire({
          ...baseInscriptionInput,
          familleId: 1, // délibérément différent de la vraie famille du père (77)
          pere: { mode: "existant", id: 50 },
        });

        const appelMembre = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Amadou");
        expect(appelMembre?.[1]).toMatchObject({ familleId: 77 });
        // input.familleId (1) n'est jamais vérifié — sans intérêt puisqu'il
        // est ignoré : la famille du père fait foi.
        expect(familleRepository.familleRepository.findById).not.toHaveBeenCalledWith({ id: 1 });
      });

      it("reuses the père existant's famille even when it's a famille relative — the exact value is copied, no chain-walking needed here (TESTS 2, 3)", async () => {
        // La remontée jusqu'à la fondatrice (familleParenteId) est déjà
        // testée dans famille.service.test.ts — ici, on vérifie juste que
        // auth.service.ts copie fidèlement la famille RÉELLE du père,
        // quelle que soit sa profondeur dans la hiérarchie.
        vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
          fakePersonne({ id: 51, sexe: "homme", familleId: 303 }), // Famille C, relative de B, relative de A
        );

        await authService.inscrire({
          ...baseInscriptionInput,
          pere: { mode: "existant", id: 51 },
        });

        const appelMembre = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Amadou");
        expect(appelMembre?.[1]).toMatchObject({ familleId: 303 });
      });

      it("prefers the père's famille over the mère's when both existant belong to different familles", async () => {
        vi.mocked(personneRepository.personneRepository.findById).mockImplementation((where) => {
          const id = (where as { id: number }).id;
          if (id === 60)
            return Promise.resolve(fakePersonne({ id: 60, sexe: "homme", familleId: 77 }));
          if (id === 61)
            return Promise.resolve(fakePersonne({ id: 61, sexe: "femme", familleId: 88 }));
          return Promise.resolve(null);
        });

        await authService.inscrire({
          ...baseInscriptionInput,
          pere: { mode: "existant", id: 60 },
          mere: { mode: "existant", id: 61 },
        });

        const appelMembre = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Amadou");
        expect(appelMembre?.[1]).toMatchObject({ familleId: 77 });
      });

      it("uses the mère's famille when only the mère is existante (père absent)", async () => {
        vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
          fakePersonne({ id: 61, sexe: "femme", familleId: 88 }),
        );

        await authService.inscrire({
          ...baseInscriptionInput,
          mere: { mode: "existant", id: 61 },
        });

        const appelMembre = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Amadou");
        expect(appelMembre?.[1]).toMatchObject({ familleId: 88 });
      });

      it("places a newly-created mère in the père existant's famille, not input.familleId (TEST 6)", async () => {
        vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
          fakePersonne({ id: 62, sexe: "homme", familleId: 77 }),
        );

        await authService.inscrire({
          ...baseInscriptionInput,
          pere: { mode: "existant", id: 62 },
          mere: {
            mode: "nouveau",
            donnees: nouvellePersonne({ prenom: "Mere", nom: "X", sexe: "femme" }),
          },
        });

        const appelMere = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Mere");
        expect(appelMere?.[1]).toMatchObject({ familleId: 77 });
      });

      it("places a newly-created père in the mère existante's famille, not input.familleId (TEST 7)", async () => {
        vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
          fakePersonne({ id: 63, sexe: "femme", familleId: 88 }),
        );

        await authService.inscrire({
          ...baseInscriptionInput,
          mere: { mode: "existant", id: 63 },
          pere: {
            mode: "nouveau",
            donnees: nouvellePersonne({ prenom: "Pere", nom: "X", sexe: "homme" }),
          },
        });

        const appelPere = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Pere");
        expect(appelPere?.[1]).toMatchObject({ familleId: 88 });
      });

      it("falls back to input.familleId, and still validates it, when neither parent is existant (no regression, TEST 8)", async () => {
        vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(
          fakeFamille({ id: 42 }),
        );

        await authService.inscrire({ ...baseInscriptionInput, familleId: 42 });

        expect(familleRepository.familleRepository.findOne).toHaveBeenCalledWith({
          id: 42,
          deletedAt: null,
        });
        const appelMembre = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Amadou");
        expect(appelMembre?.[1]).toMatchObject({ familleId: 42 });
      });

      it("rejects with 404 when input.familleId is invalid and no parent is existant (fallback path only)", async () => {
        vi.mocked(familleRepository.familleRepository.findOne).mockResolvedValue(null);

        await expect(
          authService.inscrire({ ...baseInscriptionInput, familleId: 999_999 }),
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
      });

      it("founds a new famille inside the transaction when the père is created from scratch with nouvelleFamille and no familleId is given", async () => {
        vi.mocked(familleRepository.creerAvecClient).mockResolvedValue(
          fakeFamille({ id: 999, nom: "DIALLO", familleParenteId: null, estFondatriceOrigine: true }),
        );
        const { familleId: _omis, ...sansFamilleId } = baseInscriptionInput;

        await authService.inscrire({
          ...sansFamilleId,
          nouvelleFamille: { nom: "DIALLO" },
          pere: {
            mode: "nouveau",
            donnees: nouvellePersonne({ prenom: "Pere", nom: "Diallo", sexe: "homme" }),
          },
        });

        expect(familleRepository.creerAvecClient).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ nom: "DIALLO", estFondatriceOrigine: true }),
        );
        const appelPere = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Pere");
        expect(appelPere?.[1]).toMatchObject({ familleId: 999 });
        const appelMembre = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Amadou");
        expect(appelMembre?.[1]).toMatchObject({ familleId: 999 });
      });

      it("prefers a père existant's real famille over nouvelleFamille when both happen to be present", async () => {
        vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
          fakePersonne({ id: 64, sexe: "homme", familleId: 77 }),
        );

        await authService.inscrire({
          ...baseInscriptionInput,
          familleId: 999_999,
          nouvelleFamille: { nom: "IGNOREE" },
          pere: { mode: "existant", id: 64 },
        });

        expect(familleRepository.creerAvecClient).not.toHaveBeenCalled();
        const appelMembre = vi
          .mocked(personneRepository.creerAvecClient)
          .mock.calls.find(([, data]) => data.prenom === "Amadou");
        expect(appelMembre?.[1]).toMatchObject({ familleId: 77 });
      });

      it("rejects with a service-level error when neither familleId nor nouvelleFamille can be resolved (defense in depth beyond the Zod refine)", async () => {
        const { familleId: _omis, ...sansFamilleId } = baseInscriptionInput;

        await expect(
          authService.inscrire(sansFamilleId as InscriptionInput),
        ).rejects.toMatchObject({ statusCode: 500 });
        expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
      });
    });

    it("attaches an existing sibling with no prior parents to the resolved père/mère, and shares them with a new sibling too (TESTS 2, 5, 11)", async () => {
      const fratrieExistante = fakePersonne({
        id: 77,
        prenom: "Existant",
        nom: "Diallo",
        pereId: null,
        mereId: null,
      });
      vi.mocked(personneRepository.personneRepository.findById).mockImplementation((where) =>
        Promise.resolve("id" in where && where.id === 77 ? fratrieExistante : null),
      );

      const resultat = await authService.inscrire({
        ...baseInscriptionInput,
        pere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Pere", nom: "Diallo", sexe: "homme" }),
        },
        mere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Mere", nom: "Diallo", sexe: "femme" }),
        },
        fratrie: [
          { mode: "existant", id: 77 },
          {
            mode: "nouveau",
            donnees: nouvellePersonne({ prenom: "Frere", nom: "Diallo", sexe: "homme" }),
          },
        ],
      });

      expect(resultat.fratrie).toHaveLength(2);
      expect(resultat.fratrie[0]).toMatchObject({ id: 77, cree: false });
      expect(resultat.fratrie[1]?.cree).toBe(true);

      // L'existant est réellement rattaché (pereId ET mereId), pas juste
      // renvoyé tel quel : trouverFratrie() ne le retrouverait jamais sinon.
      expect(personneRepository.mettreAJourAvecClient).toHaveBeenCalledWith(
        expect.anything(),
        { id: 77 },
        expect.objectContaining({
          pereId: expect.any(Number) as number,
          mereId: expect.any(Number) as number,
        }),
      );

      const nouveauFrereAppel = vi
        .mocked(personneRepository.creerAvecClient)
        .mock.calls.find(([, data]) => data.prenom === "Frere");
      expect(nouveauFrereAppel?.[1]).toMatchObject({
        pereId: expect.any(Number) as number,
        mereId: expect.any(Number) as number,
      });
    });

    it("rejects with 409 when an existing sibling already has a different père on file — never overwrites silently", async () => {
      const fratrieExistante = fakePersonne({ id: 77, pereId: 555, mereId: null });
      vi.mocked(personneRepository.personneRepository.findById).mockImplementation((where) =>
        Promise.resolve("id" in where && where.id === 77 ? fratrieExistante : null),
      );

      await expect(
        authService.inscrire({
          ...baseInscriptionInput,
          pere: {
            mode: "nouveau",
            donnees: nouvellePersonne({ prenom: "Pere", nom: "Diallo", sexe: "homme" }),
          },
          fratrie: [{ mode: "existant", id: 77 }],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(personneRepository.mettreAJourAvecClient).not.toHaveBeenCalled();
    });

    it("does not call mettreAJourAvecClient when the existing sibling's parents already match — nothing to change", async () => {
      // pereId already resolves to whichever id creerAvecClient will assign to
      // the newly-created père (id 200, per the nextId counter reset above).
      const fratrieExistante = fakePersonne({ id: 77, pereId: 200, mereId: null });
      vi.mocked(personneRepository.personneRepository.findById).mockImplementation((where) =>
        Promise.resolve("id" in where && where.id === 77 ? fratrieExistante : null),
      );

      await authService.inscrire({
        ...baseInscriptionInput,
        pere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Pere", nom: "Diallo", sexe: "homme" }),
        },
        fratrie: [{ mode: "existant", id: 77 }],
      });

      expect(personneRepository.mettreAJourAvecClient).not.toHaveBeenCalled();
    });

    it("demi-frère : a new sibling's own mère overrides the member's mère, and unites her with the père (TESTS 6, 12)", async () => {
      const resultat = await authService.inscrire({
        ...baseInscriptionInput,
        pere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "Pere", nom: "Diallo", sexe: "homme" }),
        },
        mere: {
          mode: "nouveau",
          donnees: nouvellePersonne({ prenom: "MereMembre", nom: "Diallo", sexe: "femme" }),
        },
        fratrie: [
          {
            mode: "nouveau",
            donnees: nouvellePersonne({ prenom: "DemiFrere", nom: "Diallo", sexe: "homme" }),
            mere: {
              mode: "nouveau",
              donnees: nouvellePersonne({ prenom: "AutreMere", nom: "Sow", sexe: "femme" }),
            },
          },
        ],
      });

      const membre = resultat.personne;
      const appels = vi.mocked(personneRepository.creerAvecClient).mock;
      const autreMereIndex = appels.calls.findIndex(([, data]) => data.prenom === "AutreMere");
      const autreMereCree = (await appels.results[autreMereIndex]!.value) as Personne;
      const demiFrereAppel = appels.calls.find(([, data]) => data.prenom === "DemiFrere");

      expect(autreMereIndex).toBeGreaterThanOrEqual(0);
      expect(demiFrereAppel?.[1].mereId).toBe(autreMereCree.id);
      // mereId assigned to the demi-frère must differ from the member's own mereId.
      expect(demiFrereAppel?.[1].mereId).not.toBe(membre.mereId);

      // The new mère is united with the père too — same coherence rule as the member's own parents.
      expect(unionRepository.creerAvecClient).toHaveBeenCalledTimes(2); // père+mèreMembre, père+autreMère
    });

    it("creates one Union per union's conjoint, with children linked to member+conjoint by sexe (TESTS 3, 4)", async () => {
      const conjointExistant = fakePersonne({
        id: 88,
        prenom: "Fatoumata",
        nom: "Bah",
        sexe: "femme",
      });
      vi.mocked(personneRepository.personneRepository.findById).mockImplementation((where) =>
        Promise.resolve("id" in where && where.id === 88 ? conjointExistant : null),
      );
      vi.mocked(unionRepository.creerAvecClient).mockImplementation((_tx, data) =>
        Promise.resolve(
          fakeUnion({
            epouxId: data.epouxId,
            epouseId: data.epouseId,
            statut: data.statut,
          }),
        ),
      );

      const resultat = await authService.inscrire({
        ...baseInscriptionInput,
        statutMatrimonial: "marie",
        unions: [
          {
            conjoint: { mode: "existant", id: 88 },
            enfants: [
              {
                mode: "nouveau",
                donnees: nouvellePersonne({ prenom: "Lucas", nom: "Diallo", sexe: "homme" }),
              },
            ],
          },
          {
            conjoint: {
              mode: "nouveau",
              donnees: nouvellePersonne({ prenom: "Aissatou", nom: "Sow", sexe: "femme" }),
            },
            enfants: [],
          },
        ],
      });

      expect(resultat.unions).toHaveLength(2);
      expect(unionRepository.creerAvecClient).toHaveBeenCalledTimes(2);
      for (const [, data] of vi.mocked(unionRepository.creerAvecClient).mock.calls) {
        expect(data.statut).toBe("marie");
        expect(data.epouxId).toBe(resultat.personne.id);
      }

      expect(resultat.unions[0]?.enfants).toHaveLength(1);
      const enfantAppel = vi
        .mocked(personneRepository.creerAvecClient)
        .mock.calls.find(([, data]) => data.prenom === "Lucas");
      // Membre (homme) → pereId, conjointe (femme) → mereId.
      expect(enfantAppel?.[1]).toMatchObject({
        pereId: resultat.personne.id,
        mereId: 88,
        generation: resultat.personne.generation + 1,
      });
    });

    it("attaches an existing enfant with no prior parents (TEST 2/11 analogue for enfants), rejects a conflicting one", async () => {
      const enfantLibre = fakePersonne({ id: 300, pereId: null, mereId: null });
      const enfantDejaRattache = fakePersonne({ id: 301, pereId: 999, mereId: null });
      vi.mocked(personneRepository.personneRepository.findById).mockImplementation((where) => {
        if (!("id" in where)) return Promise.resolve(null);
        if (where.id === 300) return Promise.resolve(enfantLibre);
        if (where.id === 301) return Promise.resolve(enfantDejaRattache);
        return Promise.resolve(null);
      });

      const resultatOk = await authService.inscrire({
        ...baseInscriptionInput,
        statutMatrimonial: "marie",
        unions: [
          {
            conjoint: {
              mode: "nouveau",
              donnees: nouvellePersonne({ prenom: "Conjointe", nom: "Sow", sexe: "femme" }),
            },
            enfants: [{ mode: "existant", id: 300 }],
          },
        ],
      });
      expect(resultatOk.unions[0]?.enfants[0]).toMatchObject({ id: 300, cree: false });
      expect(personneRepository.mettreAJourAvecClient).toHaveBeenCalledWith(
        expect.anything(),
        { id: 300 },
        expect.anything(),
      );

      await expect(
        authService.inscrire({
          ...baseInscriptionInput,
          statutMatrimonial: "marie",
          unions: [
            {
              conjoint: {
                mode: "nouveau",
                donnees: nouvellePersonne({ prenom: "Conjointe2", nom: "Sow", sexe: "femme" }),
              },
              enfants: [{ mode: "existant", id: 301 }],
            },
          ],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects with 409 on a duplicate detected for a fratrie[i] entry, even when the member itself has no duplicate", async () => {
      vi.mocked(personneRepository.personneRepository.findAll).mockImplementation((args) => {
        const where = args?.where as { prenom?: string } | undefined;
        return Promise.resolve(where?.prenom === "Doublon" ? [fakePersonne()] : []);
      });

      await expect(
        authService.inscrire({
          ...baseInscriptionInput,
          fratrie: [
            { mode: "nouveau", donnees: nouvellePersonne({ prenom: "Doublon", nom: "Diallo" }) },
          ],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(personneRepository.creerAvecClient).not.toHaveBeenCalled();
    });
  });
});

describe("inscriptionSchema (Zod)", () => {
  const base = {
    prenom: "Amadou",
    nom: "Diallo",
    sexe: "homme" as const,
    email: "amadou@example.com",
    familleId: 1,
  };

  it("rejects a père created on the fly with sexe femme", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      pere: { mode: "nouveau", donnees: { prenom: "X", nom: "Y", sexe: "femme" } },
    });
    expect(resultat.success).toBe(false);
  });

  it("rejects a mère created on the fly with sexe homme", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      mere: { mode: "nouveau", donnees: { prenom: "X", nom: "Y", sexe: "homme" } },
    });
    expect(resultat.success).toBe(false);
  });

  it("rejects a non-empty unions list when statutMatrimonial is célibataire", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      statutMatrimonial: "celibataire",
      unions: [{ conjoint: { mode: "existant", id: 1 }, enfants: [] }],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejects a non-empty unions list when statutMatrimonial is absent", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      unions: [{ conjoint: { mode: "existant", id: 1 }, enfants: [] }],
    });
    expect(resultat.success).toBe(false);
  });

  it("accepts a unions list when statutMatrimonial is marié(e), and defaults fratrie/unions/enfantsAutres to []", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      statutMatrimonial: "marie",
      unions: [{ conjoint: { mode: "existant", id: 1 }, enfants: [] }],
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.fratrie).toEqual([]);
      expect(resultat.data.unions).toHaveLength(1);
      expect(resultat.data.enfantsAutres).toEqual([]);
    }
  });

  it("rejects when père and mère are the same existing personne", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      pere: { mode: "existant", id: 5 },
      mere: { mode: "existant", id: 5 },
    });
    expect(resultat.success).toBe(false);
  });

  it("rejects when the same existing personne is referenced in two different roles (père and fratrie)", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      pere: { mode: "existant", id: 5 },
      fratrie: [{ mode: "existant", id: 5 }],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejects when the same existing personne is referenced as both a union conjoint and an enfant of that union", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      statutMatrimonial: "marie",
      unions: [{ conjoint: { mode: "existant", id: 7 }, enfants: [{ mode: "existant", id: 7 }] }],
    });
    expect(resultat.success).toBe(false);
  });

  it("accepts a fratrie[i] nouveau entry with its own nouveau mère override", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      fratrie: [
        {
          mode: "nouveau",
          donnees: { prenom: "DemiFrere", nom: "Diallo", sexe: "homme" },
          mere: { mode: "nouveau", donnees: { prenom: "AutreMere", nom: "Sow", sexe: "femme" } },
        },
      ],
    });
    expect(resultat.success).toBe(true);
  });

  it("rejects a fratrie[i] nouveau mère override with sexe homme", () => {
    const resultat = inscriptionSchema.safeParse({
      ...base,
      fratrie: [
        {
          mode: "nouveau",
          donnees: { prenom: "DemiFrere", nom: "Diallo", sexe: "homme" },
          mere: { mode: "nouveau", donnees: { prenom: "X", nom: "Y", sexe: "homme" } },
        },
      ],
    });
    expect(resultat.success).toBe(false);
  });

  it("accepts nouvelleFamille in place of familleId when the père is created from scratch", () => {
    const { familleId: _omis, ...sansFamilleId } = base;
    const resultat = inscriptionSchema.safeParse({
      ...sansFamilleId,
      nouvelleFamille: { nom: "diallo" },
      pere: { mode: "nouveau", donnees: { prenom: "Pere", nom: "Diallo", sexe: "homme" } },
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      // Même normalisation que Famille.nom côté famille.validator.ts.
      expect(resultat.data.nouvelleFamille).toEqual({ nom: "DIALLO" });
      expect(resultat.data.familleId).toBeUndefined();
    }
  });

  it("rejects when neither familleId nor nouvelleFamille is given and neither parent is existant", () => {
    const { familleId: _omis, ...sansFamilleId } = base;
    const resultat = inscriptionSchema.safeParse(sansFamilleId);
    expect(resultat.success).toBe(false);
  });

  it("accepts familleId absent when the père is existant (his real famille resolves it server-side)", () => {
    const { familleId: _omis, ...sansFamilleId } = base;
    const resultat = inscriptionSchema.safeParse({
      ...sansFamilleId,
      pere: { mode: "existant", id: 5 },
    });
    expect(resultat.success).toBe(true);
  });
});

describe("connecter", () => {
  let hashConnu: string;
  const motDePasseConnu = "MotDePasseCorrect1";

  beforeAll(async () => {
    hashConnu = await hacherMotDePasse(motDePasseConnu);
  });

  it("returns a token for correct credentials", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(
      fakeUtilisateur({ motDePasseHash: hashConnu }),
    );

    const resultat = await authService.connecter({
      identifiant: "amadou@example.com",
      motDePasse: motDePasseConnu,
    });

    expect(typeof resultat.token).toBe("string");
    expect(resultat.utilisateur).not.toHaveProperty("motDePasseHash");
  });

  it("rejects an unknown identifiant with 401", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);

    await expect(
      authService.connecter({ identifiant: "inconnu", motDePasse: "peu.importe" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects an incorrect password with 401", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(
      fakeUtilisateur({ motDePasseHash: hashConnu }),
    );

    await expect(
      authService.connecter({ identifiant: "amadou@example.com", motDePasse: "MauvaisMotDePasse" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a deactivated account with 401, even with the correct password", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(
      fakeUtilisateur({ motDePasseHash: hashConnu, actif: false, supprime: true }),
    );

    await expect(
      authService.connecter({ identifiant: "amadou@example.com", motDePasse: motDePasseConnu }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("logs in with a matricule (falls back to Personne -> Utilisateur lookup)", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 42, matricule: "MSD-000042" }),
    );
    vi.mocked(utilisateursRepository.trouverParPersonneId).mockResolvedValue(
      fakeUtilisateur({ motDePasseHash: hashConnu, personneId: 42 }),
    );

    const resultat = await authService.connecter({
      identifiant: "MSD-000042",
      motDePasse: motDePasseConnu,
    });

    expect(typeof resultat.token).toBe("string");
    expect(utilisateursRepository.trouverParPersonneId).toHaveBeenCalledWith(42);
  });

  it("logs in with a telephone number (falls back to Personne -> Utilisateur lookup)", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 43, telephone: "+224600000099" }),
    );
    vi.mocked(utilisateursRepository.trouverParPersonneId).mockResolvedValue(
      fakeUtilisateur({ motDePasseHash: hashConnu, personneId: 43 }),
    );

    const resultat = await authService.connecter({
      identifiant: "+224600000099",
      motDePasse: motDePasseConnu,
    });

    expect(typeof resultat.token).toBe("string");
  });

  it("rejects with 401 when the matricule/téléphone matches a personne with no linked compte", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(
      fakePersonne({ id: 44 }),
    );
    vi.mocked(utilisateursRepository.trouverParPersonneId).mockResolvedValue(null);

    await expect(
      authService.connecter({ identifiant: "MSD-000044", motDePasse: "peu-importe" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("logs in with an e-mail typed in a different case than the one stored", async () => {
    // Un e-mail est toujours stocké en minuscules, jamais tapé ainsi. Selon la
    // collation MySQL, l'égalité peut être sensible à la casse : la connexion
    // ne doit pas dépendre d'un réglage de serveur.
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockImplementation(
      (valeur: string) =>
        Promise.resolve(
          valeur === "amadou@example.com" ? fakeUtilisateur({ motDePasseHash: hashConnu }) : null,
        ),
    );

    const resultat = await authService.connecter({
      identifiant: "Amadou@Example.COM",
      motDePasse: motDePasseConnu,
    });

    expect(typeof resultat.token).toBe("string");
  });

  it("logs in with a matricule typed in lowercase", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.findOne).mockImplementation((where) =>
      Promise.resolve(
        JSON.stringify(where).includes("MSD-000042") ? fakePersonne({ id: 42 }) : null,
      ),
    );
    vi.mocked(utilisateursRepository.trouverParPersonneId).mockResolvedValue(
      fakeUtilisateur({ motDePasseHash: hashConnu, personneId: 42 }),
    );

    const resultat = await authService.connecter({
      identifiant: "msd-000042",
      motDePasse: motDePasseConnu,
    });

    expect(typeof resultat.token).toBe("string");
    expect(utilisateursRepository.trouverParPersonneId).toHaveBeenCalledWith(42);
  });

  it("logs in with a téléphone written differently than the one stored", async () => {
    // Le numéro part en base exactement tel qu'il a été saisi : une fiche
    // enregistrée avant la règle de saisie porte encore ses espaces, que le
    // membre ne reproduira pas en se connectant.
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.trouverCandidatsParTelephone).mockResolvedValue(
      [{ id: 43, telephone: "620 00 00 00" }],
    );
    vi.mocked(personneRepository.personneRepository.findById).mockResolvedValue(
      fakePersonne({ id: 43, telephone: "620 00 00 00" }),
    );
    vi.mocked(utilisateursRepository.trouverParPersonneId).mockResolvedValue(
      fakeUtilisateur({ motDePasseHash: hashConnu, personneId: 43 }),
    );

    const resultat = await authService.connecter({
      identifiant: "+224620000000",
      motDePasse: motDePasseConnu,
    });

    expect(typeof resultat.token).toBe("string");
    expect(utilisateursRepository.trouverParPersonneId).toHaveBeenCalledWith(43);
  });

  it("rejects with 401 when a téléphone matches several fiches, rather than picking one", async () => {
    // L'unicité en base empêche deux fiches de porter le même numéro à
    // l'identique, pas d'en porter deux écritures différentes. Un numéro
    // ambigu ne doit jamais ouvrir de session sur une identité choisie au
    // hasard : l'administrateur tranche sur les fiches.
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.trouverCandidatsParTelephone).mockResolvedValue(
      [
        { id: 43, telephone: "620 00 00 00" },
        { id: 44, telephone: "+224620000000" },
      ],
    );

    await expect(
      authService.connecter({ identifiant: "620000000", motDePasse: motDePasseConnu }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(personneRepository.personneRepository.findById).not.toHaveBeenCalled();
  });

  it("does not scan phone numbers for an identifiant that is not one", async () => {
    vi.mocked(utilisateursRepository.trouverParIdentifiantOuEmail).mockResolvedValue(null);
    vi.mocked(personneRepository.personneRepository.findOne).mockResolvedValue(null);

    await expect(
      authService.connecter({ identifiant: "amadou", motDePasse: motDePasseConnu }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(
      personneRepository.personneRepository.trouverCandidatsParTelephone,
    ).not.toHaveBeenCalled();
  });
});

describe("rafraichir", () => {
  const utilisateurId = 10;
  const utilisateurUuid = "33333333-3333-4333-8333-333333333333";

  it("returns a fresh token pair for a valid refresh token", async () => {
    vi.mocked(utilisateursRepository.trouverParId).mockResolvedValue(fakeUtilisateur());
    const refreshToken = signerRefreshToken({ utilisateurId, utilisateurUuid });

    const resultat = await authService.rafraichir({ refreshToken });

    expect(typeof resultat.token).toBe("string");
    expect(typeof resultat.refreshToken).toBe("string");
  });

  it("rejects an access token presented as a refresh token", async () => {
    const accessToken = signerToken({ utilisateurId, utilisateurUuid });

    await expect(authService.rafraichir({ refreshToken: accessToken })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects a malformed refresh token", async () => {
    await expect(
      authService.rafraichir({ refreshToken: "not-a-jwt" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a refresh token for a deactivated account", async () => {
    vi.mocked(utilisateursRepository.trouverParId).mockResolvedValue(
      fakeUtilisateur({ actif: false, supprime: true }),
    );
    const refreshToken = signerRefreshToken({ utilisateurId, utilisateurUuid });

    await expect(authService.rafraichir({ refreshToken })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects a refresh token for an utilisateur that no longer exists", async () => {
    vi.mocked(utilisateursRepository.trouverParId).mockResolvedValue(null);
    const refreshToken = signerRefreshToken({ utilisateurId, utilisateurUuid });

    await expect(authService.rafraichir({ refreshToken })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("changerMotDePasse", () => {
  const utilisateurId = 10;
  let hashConnu: string;
  const motDePasseConnu = "MotDePasseCorrect1";

  beforeAll(async () => {
    hashConnu = await hacherMotDePasse(motDePasseConnu);
  });

  it("hashes and persists the new password — no current password required", async () => {
    vi.mocked(utilisateursRepository.trouverParId).mockResolvedValue(
      fakeUtilisateur({ id: utilisateurId, motDePasseHash: hashConnu }),
    );
    vi.mocked(utilisateursRepository.mettreAJourMotDePasse).mockResolvedValue(
      fakeUtilisateur({ id: utilisateurId }),
    );

    await authService.changerMotDePasse(utilisateurId, {
      nouveauMotDePasse: "NouveauMotDePasse99",
    });

    expect(utilisateursRepository.mettreAJourMotDePasse).toHaveBeenCalledTimes(1);
    const [idAppele, hashPersiste] = vi.mocked(utilisateursRepository.mettreAJourMotDePasse).mock
      .calls[0]!;
    expect(idAppele).toBe(utilisateurId);
    await expect(verifierMotDePasse("NouveauMotDePasse99", hashPersiste)).resolves.toBe(true);
  });

  it("rejects with 409 when the new password is the same as the current one", async () => {
    vi.mocked(utilisateursRepository.trouverParId).mockResolvedValue(
      fakeUtilisateur({ id: utilisateurId, motDePasseHash: hashConnu }),
    );

    await expect(
      authService.changerMotDePasse(utilisateurId, {
        nouveauMotDePasse: motDePasseConnu,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(utilisateursRepository.mettreAJourMotDePasse).not.toHaveBeenCalled();
  });

  it("rejects with 404 for an unknown utilisateur", async () => {
    vi.mocked(utilisateursRepository.trouverParId).mockResolvedValue(null);

    await expect(
      authService.changerMotDePasse(utilisateurId, {
        nouveauMotDePasse: "NouveauMotDePasse99",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
