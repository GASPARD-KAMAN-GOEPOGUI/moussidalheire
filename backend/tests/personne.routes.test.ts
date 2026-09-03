import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb` — full CRUD + real
 * business rules (matricule/generation auto-calc, cycle detection, duplicate
 * detection, genealogy reads). Same conventions as tests/utilisateurs.routes.test.ts:
 * a per-run fixture family, cleanup via `deleteMany`/`delete` in this test
 * file's own `afterAll` (test-harness hygiene, never in `src/`, never
 * through the API — the "no physical deletion" tests below verify the API
 * itself never does this). No-op pass (not a failure) if MySQL isn't reachable.
 *
 * `POST`/`PUT /personnes` requièrent désormais `requireAuth` (tout membre
 * connecté) ; `desactiver`/`restaurer` requièrent en plus `requireRole("admin")`
 * — voir `personne.routes.ts`. Deux comptes de test partagés (jamais liés à
 * une `Personne`, non nécessaire pour ces vérifications) fournissent les
 * tokens ; les lectures (`GET`) restent publiques (`attachUtilisateurSiPresent`,
 * jamais bloquant), donc aucun token n'y est nécessaire.
 */

const app = createApp();
const RUN_PREFIX = `test_${Date.now()}`;

let dbAvailable = false;
let familleTestId: number;
const utilisateurIds: number[] = [];
let tokenMembre: string;
let tokenAdmin: string;
// Second membre account — jamais utilisé par `creerPersonne()`/`modifierPersonne()`
// par défaut — dédié aux tests de la restriction de modification (mission
// "restriction de modification des personnes") : tout ce que `tokenMembre`
// crée lui appartient automatiquement, donc un second compte est nécessaire
// pour prouver qu'il ne peut PAS modifier ce qu'il n'a ni créé ni lui-même.
let tokenMembreB: string;
let personneBUuid: string;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;
  const famille = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX}` } });
  familleTestId = famille.id;

  const membre = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_membre@example.com`,
      email: `${RUN_PREFIX}_membre@example.com`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "membre",
    },
  });
  utilisateurIds.push(membre.id);
  tokenMembre = signerToken({ utilisateurId: membre.id, utilisateurUuid: membre.uuid });

  const admin = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_admin@example.com`,
      email: `${RUN_PREFIX}_admin@example.com`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "admin",
    },
  });
  utilisateurIds.push(admin.id);
  tokenAdmin = signerToken({ utilisateurId: admin.id, utilisateurUuid: admin.uuid });

  const personneB = await prisma.personne.create({
    data: { prenom: "Fatoumata", nom: `${RUN_PREFIX}_B`, sexe: "femme", familleId: familleTestId },
  });
  personneBUuid = personneB.uuid;
  const membreB = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_membreB@example.com`,
      email: `${RUN_PREFIX}_membreB@example.com`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "membre",
      personneId: personneB.id,
    },
  });
  utilisateurIds.push(membreB.id);
  tokenMembreB = signerToken({ utilisateurId: membreB.id, utilisateurUuid: membreB.uuid });
});

afterAll(async () => {
  if (!dbAvailable) return;
  if (utilisateurIds.length > 0) {
    await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
  }
  await prisma.personne.deleteMany({ where: { familleId: familleTestId } });
  await prisma.famille.delete({ where: { id: familleTestId } });
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

const nouvellePersonne = (overrides: Record<string, unknown> = {}) => ({
  prenom: "Amadou",
  nom: `Test-${Math.random().toString(36).slice(2, 8)}`,
  sexe: "homme",
  familleId: familleTestId,
  ...overrides,
});

/** `POST /personnes` (requireAuth). */
function creerPersonne(donnees: Record<string, unknown> = nouvellePersonne()) {
  return request(app)
    .post("/api/v1/personnes")
    .set("Authorization", `Bearer ${tokenMembre}`)
    .send(donnees);
}

/** `PUT /personnes/:id` (requireAuth). */
function modifierPersonne(uuid: string, donnees: Record<string, unknown>) {
  return request(app)
    .put(`/api/v1/personnes/${uuid}`)
    .set("Authorization", `Bearer ${tokenMembre}`)
    .send(donnees);
}

describe("Personnes CRUD API", () => {
  describe("POST /api/v1/personnes", () => {
    itDb("creates a person with an auto-generated matricule and generation 0", async () => {
      const res = await creerPersonne(nouvellePersonne());

      expect(res.status).toBe(201);
      expect(res.body.personne.matricule).toMatch(/^MSD-\d{6}$/);
      expect(res.body.personne.generation).toBe(0);
      expect(res.body.personne.actif).toBe(true);
      expect(res.body.personne.deletedAt).toBeNull();
    });

    itDb("computes generation as pereId's generation + 1", async () => {
      const pere = await creerPersonne(nouvellePersonne({ sexe: "homme" }));
      const enfant = await creerPersonne(nouvellePersonne({ pereId: pere.body.personne.id }));

      expect(enfant.status).toBe(201);
      expect(enfant.body.personne.generation).toBe(pere.body.personne.generation + 1);
    });

    itDb("assigns strictly increasing matricules across successive creations", async () => {
      const a = await creerPersonne(nouvellePersonne());
      const b = await creerPersonne(nouvellePersonne());

      const numA = Number(a.body.personne.matricule.split("-")[1]);
      const numB = Number(b.body.personne.matricule.split("-")[1]);
      expect(numB).toBeGreaterThan(numA);
    });

    itDb("rejects an unknown familleId with 404", async () => {
      const res = await creerPersonne(nouvellePersonne({ familleId: 999_999_999 }));

      expect(res.status).toBe(404);
    });

    itDb("rejects an unknown pereId with 404", async () => {
      const res = await creerPersonne(nouvellePersonne({ pereId: 999_999_999 }));

      expect(res.status).toBe(404);
    });

    itDb("rejects a duplicate (same prenom/nom/dateNaissance) with 409 by default", async () => {
      const donnees = nouvellePersonne({ dateNaissance: "1990-01-01" });
      await creerPersonne(donnees);

      const res = await creerPersonne(donnees);

      expect(res.status).toBe(409);
      expect(Array.isArray(res.body.error.details.doublons)).toBe(true);
    });

    itDb("allows a duplicate through with forcerCreation=true", async () => {
      const donnees = nouvellePersonne({ dateNaissance: "1991-01-01" });
      await creerPersonne(donnees);

      const res = await creerPersonne({ ...donnees, forcerCreation: true });

      expect(res.status).toBe(201);
    });

    itDb("rejects invalid data with 400", async () => {
      const res = await creerPersonne({});
      expect(res.status).toBe(400);
    });

    itDb("rejects a client-supplied matricule/generation (strict schema)", async () => {
      const res = await creerPersonne({
        ...nouvellePersonne(),
        matricule: "MSD-999999",
        generation: 42,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/personnes and /:id", () => {
    itDb("retrieves a person by uuid", async () => {
      const created = await creerPersonne(nouvellePersonne());

      const res = await request(app).get(`/api/v1/personnes/${created.body.personne.uuid}`);

      expect(res.status).toBe(200);
      expect(res.body.personne.id).toBe(created.body.personne.id);
    });

    itDb("returns 404 for a nonexistent uuid", async () => {
      const res = await request(app).get("/api/v1/personnes/11111111-1111-4111-8111-111111111111");
      expect(res.status).toBe(404);
    });

    itDb("lists people filtered by familleId", async () => {
      await creerPersonne(nouvellePersonne());

      const res = await request(app).get(`/api/v1/personnes?familleId=${familleTestId}`);

      expect(res.status).toBe(200);
      expect(res.body.personnes.length).toBeGreaterThan(0);
      expect(
        res.body.personnes.every((p: { familleId: number }) => p.familleId === familleTestId),
      ).toBe(true);
    });

    itDb("finds the exact person by matricule", async () => {
      const created = await creerPersonne(nouvellePersonne());
      const matricule = created.body.personne.matricule;

      const res = await request(app).get(`/api/v1/personnes?matricule=${matricule}`);

      expect(res.status).toBe(200);
      expect(res.body.personnes).toHaveLength(1);
      expect(res.body.personnes[0].uuid).toBe(created.body.personne.uuid);
    });

    itDb("returns an empty list for a matricule that doesn't exist", async () => {
      const res = await request(app).get("/api/v1/personnes?matricule=NOPE-999999");

      expect(res.status).toBe(200);
      expect(res.body.personnes).toHaveLength(0);
    });

    itDb("includes pereUuid/mereUuid/familleUuid alongside the numeric ids", async () => {
      const pere = await creerPersonne(nouvellePersonne());
      const enfant = await creerPersonne(nouvellePersonne({ pereId: pere.body.personne.id }));
      const famille = await prisma.famille.findUnique({ where: { id: familleTestId } });

      const parUuid = await request(app).get(`/api/v1/personnes/${enfant.body.personne.uuid}`);
      expect(parUuid.status).toBe(200);
      expect(parUuid.body.personne.pereUuid).toBe(pere.body.personne.uuid);
      expect(parUuid.body.personne.familleUuid).toBe(famille?.uuid);

      const parListe = await request(app).get(`/api/v1/personnes?familleId=${familleTestId}`);
      const enfantDansListe = parListe.body.personnes.find(
        (p: { id: number }) => p.id === enfant.body.personne.id,
      );
      expect(enfantDansListe.pereUuid).toBe(pere.body.personne.uuid);
      expect(enfantDansListe.familleUuid).toBe(famille?.uuid);
    });
  });

  describe("PUT /api/v1/personnes/:id", () => {
    itDb("performs a full update", async () => {
      const created = await creerPersonne(nouvellePersonne());
      const uuid = created.body.personne.uuid;

      const res = await modifierPersonne(uuid, nouvellePersonne({ prenom: "Modifié" }));

      expect(res.status).toBe(200);
      expect(res.body.personne.prenom).toBe("Modifié");
      expect(res.body.personne.uuid).toBe(uuid);
    });

    itDb("recomputes generation when pereId changes", async () => {
      const pere = await creerPersonne(nouvellePersonne());
      const enfant = await creerPersonne(nouvellePersonne());

      const res = await modifierPersonne(
        enfant.body.personne.uuid,
        nouvellePersonne({ pereId: pere.body.personne.id }),
      );

      expect(res.status).toBe(200);
      expect(res.body.personne.generation).toBe(pere.body.personne.generation + 1);
    });

    itDb("rejects a pereId change that would create a genealogical cycle", async () => {
      const grandParent = await creerPersonne(nouvellePersonne());
      const parent = await creerPersonne(
        nouvellePersonne({ pereId: grandParent.body.personne.id }),
      );

      // grandParent cannot become parent's own child (parent is already grandParent's ancestor chain target)
      const res = await modifierPersonne(
        grandParent.body.personne.uuid,
        nouvellePersonne({ pereId: parent.body.personne.id }),
      );

      expect(res.status).toBe(409);
    });

    itDb("has no PATCH route", async () => {
      const created = await creerPersonne(nouvellePersonne());
      const res = await request(app)
        .patch(`/api/v1/personnes/${created.body.personne.uuid}`)
        .send({ prenom: "x" });
      expect(res.status).toBe(404);
    });
  });

  describe("Lifecycle: desactiver / restaurer", () => {
    itDb("desactiver sets deletedAt and excludes from the default list", async () => {
      const created = await creerPersonne(nouvellePersonne());
      const uuid = created.body.personne.uuid;

      const res = await request(app)
        .post(`/api/v1/personnes/${uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.personne.deletedAt).not.toBeNull();

      const stillInDb = await prisma.personne.findUnique({ where: { uuid } });
      expect(stillInDb).not.toBeNull();
    });

    itDb("restaurer clears deletedAt", async () => {
      const created = await creerPersonne(nouvellePersonne());
      const uuid = created.body.personne.uuid;
      await request(app)
        .post(`/api/v1/personnes/${uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      const res = await request(app)
        .post(`/api/v1/personnes/${uuid}/restaurer`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.personne.deletedAt).toBeNull();
    });
  });

  describe("Genealogy reads: /enfants /fratrie /conjoints", () => {
    itDb("lists children via /enfants", async () => {
      const parent = await creerPersonne(nouvellePersonne());
      const enfant = await creerPersonne(nouvellePersonne({ pereId: parent.body.personne.id }));

      const res = await request(app).get(`/api/v1/personnes/${parent.body.personne.uuid}/enfants`);

      expect(res.status).toBe(200);
      expect(res.body.enfants.map((e: { id: number }) => e.id)).toContain(enfant.body.personne.id);
    });

    itDb("lists siblings via /fratrie", async () => {
      const parent = await creerPersonne(nouvellePersonne());
      const a = await creerPersonne(nouvellePersonne({ pereId: parent.body.personne.id }));
      const b = await creerPersonne(nouvellePersonne({ pereId: parent.body.personne.id }));

      const res = await request(app).get(`/api/v1/personnes/${a.body.personne.uuid}/fratrie`);

      expect(res.status).toBe(200);
      expect(res.body.fratrie.map((f: { id: number }) => f.id)).toContain(b.body.personne.id);
      const bDansFratrie = res.body.fratrie.find(
        (f: { id: number }) => f.id === b.body.personne.id,
      );
      expect(bDansFratrie.pereUuid).toBe(parent.body.personne.uuid);
    });

    itDb("returns an empty conjoints list for someone with no union", async () => {
      const created = await creerPersonne(nouvellePersonne());

      const res = await request(app).get(
        `/api/v1/personnes/${created.body.personne.uuid}/conjoints`,
      );

      expect(res.status).toBe(200);
      expect(res.body.conjoints).toEqual([]);
    });
  });

  describe("No physical deletion is possible through the API", () => {
    itDb("has no DELETE route, and the row survives", async () => {
      const created = await creerPersonne(nouvellePersonne());
      const uuid = created.body.personne.uuid;

      const res = await request(app).delete(`/api/v1/personnes/${uuid}`);

      expect(res.status).toBe(404);
      const stillInDb = await prisma.personne.findUnique({ where: { uuid } });
      expect(stillInDb).not.toBeNull();
    });
  });

  /**
   * Mission "restriction de modification des personnes" — un `membre` ne
   * peut modifier que sa propre fiche ou une fiche qu'il a réellement créée,
   * jamais une personne trouvée via la famille/branche/l'arbre. Un lien
   * familial (même famille, père/mère/enfant) ne doit jamais suffire.
   */
  describe("Restriction de modification des personnes", () => {
    itDb("TEST 1 — un utilisateur peut modifier sa propre fiche", async () => {
      const res = await request(app)
        .put(`/api/v1/personnes/${personneBUuid}`)
        .set("Authorization", `Bearer ${tokenMembreB}`)
        .send(nouvellePersonne({ prenom: "Fatoumata-Modifiée", sexe: "femme" }));

      expect(res.status).toBe(200);
      expect(res.body.personne.prenom).toBe("Fatoumata-Modifiée");
    });

    itDb("TEST 2 — un utilisateur peut modifier une personne qu'il a lui-même créée", async () => {
      const enfant = await request(app)
        .post("/api/v1/personnes")
        .set("Authorization", `Bearer ${tokenMembreB}`)
        .send(nouvellePersonne());

      const res = await request(app)
        .put(`/api/v1/personnes/${enfant.body.personne.uuid}`)
        .set("Authorization", `Bearer ${tokenMembreB}`)
        .send(nouvellePersonne({ prenom: "Modifié-par-son-créateur" }));

      expect(res.status).toBe(200);
      expect(res.body.personne.prenom).toBe("Modifié-par-son-créateur");
    });

    itDb("TEST 3 — un utilisateur ne peut PAS modifier une personne créée par un autre utilisateur", async () => {
      const creeParA = await creerPersonne(nouvellePersonne());

      const res = await request(app)
        .put(`/api/v1/personnes/${creeParA.body.personne.uuid}`)
        .set("Authorization", `Bearer ${tokenMembreB}`)
        .send(nouvellePersonne({ prenom: "Tentative-B" }));

      expect(res.status).toBe(403);
    });

    itDb("un lien familial (même famille, père/mère) ne donne jamais le droit de modification", async () => {
      // personneBUuid (Fatoumata) et cette personne créée par A partagent la
      // même famille (familleTestId) — un simple lien de famille commune.
      const memeFamille = await creerPersonne(nouvellePersonne());

      const res = await request(app)
        .put(`/api/v1/personnes/${memeFamille.body.personne.uuid}`)
        .set("Authorization", `Bearer ${tokenMembreB}`)
        .send(nouvellePersonne({ prenom: "Tentative-lien-familial" }));

      expect(res.status).toBe(403);
    });

    itDb(
      "TEST 4 — contournement API direct : PUT sur une personne créée par un autre utilisateur renvoie 403 sans rien modifier",
      async () => {
        const creeParA = await creerPersonne(nouvellePersonne({ prenom: "Original" }));
        const uuid = creeParA.body.personne.uuid;

        const res = await request(app)
          .put(`/api/v1/personnes/${uuid}`)
          .set("Authorization", `Bearer ${tokenMembreB}`)
          .send(nouvellePersonne({ prenom: "Contournement" }));

        expect(res.status).toBe(403);

        const relue = await prisma.personne.findUnique({ where: { uuid } });
        expect(relue?.prenom).toBe("Original");
      },
    );

    itDb("le refus 403 renvoie un message humain, jamais une erreur technique", async () => {
      const creeParA = await creerPersonne(nouvellePersonne());

      const res = await request(app)
        .put(`/api/v1/personnes/${creeParA.body.personne.uuid}`)
        .set("Authorization", `Bearer ${tokenMembreB}`)
        .send(nouvellePersonne());

      expect(res.body).toMatchObject({
        success: false,
        message: "Vous ne pouvez pas modifier les informations de cette personne.",
        error: { code: "FORBIDDEN" },
      });
      const texte = JSON.stringify(res.body);
      expect(texte).not.toContain("Prisma");
      expect(texte).not.toContain("foreign key");
    });

    itDb("TEST 5 — un admin conserve le droit de modifier n'importe quelle personne", async () => {
      const creeParA = await creerPersonne(nouvellePersonne());

      const res = await request(app)
        .put(`/api/v1/personnes/${creeParA.body.personne.uuid}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send(nouvellePersonne({ prenom: "Modifié-par-admin" }));

      expect(res.status).toBe(200);
      expect(res.body.personne.prenom).toBe("Modifié-par-admin");
    });

    itDb("rejects PUT without a token with 401 (avant même la vérification de propriété)", async () => {
      const creeParA = await creerPersonne(nouvellePersonne());

      const res = await request(app)
        .put(`/api/v1/personnes/${creeParA.body.personne.uuid}`)
        .send(nouvellePersonne());

      expect(res.status).toBe(401);
    });

    itDb("GET /:id expose peutModifier reflétant la même règle", async () => {
      const creeParA = await creerPersonne(nouvellePersonne());

      const commeCreateur = await request(app)
        .get(`/api/v1/personnes/${creeParA.body.personne.uuid}`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(commeCreateur.body.personne.peutModifier).toBe(true);

      const commeAutre = await request(app)
        .get(`/api/v1/personnes/${creeParA.body.personne.uuid}`)
        .set("Authorization", `Bearer ${tokenMembreB}`);
      expect(commeAutre.body.personne.peutModifier).toBe(false);

      const sansToken = await request(app).get(`/api/v1/personnes/${creeParA.body.personne.uuid}`);
      expect(sansToken.body.personne.peutModifier).toBe(false);
    });
  });
});
