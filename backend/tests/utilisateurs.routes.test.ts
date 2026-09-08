import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb` (via the actual Prisma
 * client/app — no mocking), exercising the full utilisateurs CRUD surface.
 *
 * Every fixture this file creates uses an identifiant prefixed with a unique,
 * per-run marker, and `afterAll` cleans them up with `prisma.utilisateur.
 * deleteMany()` scoped to that prefix. This is test-harness housekeeping only —
 * it runs in this test file, never in `src/`, and never through the API. It is
 * not a contradiction of "no physical deletion via the API": the application
 * code (repositories/services/controllers/routes) contains zero calls to
 * `.delete()`/`.deleteMany()`, which the "no physical deletion" tests below
 * verify directly against the running row count instead of just trusting it.
 *
 * If MySQL isn't reachable (see README — this backend is designed to boot and
 * degrade gracefully without one), every test below is a no-op pass rather than
 * a failure, matching how tests/health.test.ts already tolerates a disconnected
 * database instead of assuming one is always present.
 *
 * Every route on this router now requires `requireAuth` + `requireRole("admin")`
 * (see utilisateurs.routes.ts) — this module manages login accounts, not public
 * census data. All the pre-existing CRUD tests below run as an admin (`asAdmin`
 * wraps `request(app)` with an admin bearer token); the dedicated "permissions"
 * describe block at the end verifies 401 (no token) and 403 (membre token).
 */

const app = createApp();
const RUN_PREFIX = `test_${Date.now()}_`;
let seq = 0;
function identifiant(label: string): string {
  seq += 1;
  return `${RUN_PREFIX}${seq}_${label}`;
}

let dbAvailable = false;
let tokenAdmin: string;
let tokenMembre: string;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;

  const admin = await prisma.utilisateur.create({
    data: {
      identifiant: identifiant("admin-partage"),
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "admin",
    },
  });
  tokenAdmin = signerToken({ utilisateurId: admin.id, utilisateurUuid: admin.uuid });

  const membre = await prisma.utilisateur.create({
    data: {
      identifiant: identifiant("membre-partage"),
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "membre",
    },
  });
  tokenMembre = signerToken({ utilisateurId: membre.id, utilisateurUuid: membre.uuid });
});

afterAll(async () => {
  if (!dbAvailable) return;
  await prisma.utilisateur.deleteMany({ where: { identifiant: { startsWith: RUN_PREFIX } } });
});

/** Runs `fn` only when MySQL is reachable at test time (checked in `beforeAll`
 * above) — a no-op pass otherwise, never a failure. */
function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

function asAdmin(req: request.Test): request.Test {
  return req.set("Authorization", `Bearer ${tokenAdmin}`);
}

const post = (path: string) => asAdmin(request(app).post(path));
const get = (path: string) => asAdmin(request(app).get(path));
const put = (path: string) => asAdmin(request(app).put(path));

describe("Utilisateurs CRUD API", () => {
  describe("POST /api/v1/utilisateurs", () => {
    itDb("creates a user and never returns the password or its hash", async () => {
      const id = identifiant("create");
      const res = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        email: `${id}@example.com`,
        motDePasse: "Password123",
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        utilisateur: { identifiant: id, email: `${id}@example.com`, actif: true, supprime: false },
      });
      expect(res.body.utilisateur).not.toHaveProperty("motDePasseHash");
      expect(res.body.utilisateur).not.toHaveProperty("motDePasse");
      expect(JSON.stringify(res.body)).not.toContain("Password123");
      expect(typeof res.body.utilisateur.uuid).toBe("string");
      expect(typeof res.body.utilisateur.id).toBe("number");
    });

    itDb("rejects a duplicate identifiant with 409", async () => {
      const id = identifiant("dup-id");
      await post("/api/v1/utilisateurs").send({ identifiant: id, motDePasse: "Password123" });

      const res = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "AutrePass1",
      });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ success: false, error: { code: "CONFLICT" } });
    });

    itDb("rejects a duplicate email with 409", async () => {
      const id1 = identifiant("dup-email-1");
      const id2 = identifiant("dup-email-2");
      const email = `${id1}@example.com`;
      await post("/api/v1/utilisateurs").send({
        identifiant: id1,
        email,
        motDePasse: "Password123",
      });

      const res = await post("/api/v1/utilisateurs").send({
        identifiant: id2,
        email,
        motDePasse: "Password123",
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    itDb("rejects invalid data with a 400 validation error", async () => {
      const res = await post("/api/v1/utilisateurs").send({
        identifiant: "a",
        motDePasse: "short",
      });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    itDb("rejects a missing identifiant", async () => {
      const res = await post("/api/v1/utilisateurs").send({ motDePasse: "Password123" });
      expect(res.status).toBe(400);
    });

    // Ce test acceptait autrefois n'importe quel entier bien formé : la table
    // `personnes` n'existait pas encore, et aucune clé étrangère ne contraignait
    // `personne_id`. La contrainte existe désormais (voir schema.prisma), donc
    // un identifiant qui ne désigne aucune fiche est rejeté — c'est ce
    // comportement-là qu'il faut vérifier. Le cas nominal (personneId valide)
    // est couvert par tests/auth.routes.test.ts, qui dispose d'une fixture
    // famille + personne.
    itDb("rejects a personneId that matches no existing personne", async () => {
      const id = identifiant("personne-id");
      const res = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
        personneId: 2_000_000_000,
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/utilisateurs/:id", () => {
    itDb("retrieves a user by uuid", async () => {
      const id = identifiant("get");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });

      const res = await get(`/api/v1/utilisateurs/${created.body.utilisateur.uuid}`);

      expect(res.status).toBe(200);
      expect(res.body.utilisateur.identifiant).toBe(id);
      expect(res.body.utilisateur).not.toHaveProperty("motDePasseHash");
    });

    itDb("returns 404 for a well-formed but nonexistent uuid", async () => {
      const res = await get("/api/v1/utilisateurs/11111111-1111-4111-8111-111111111111");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    itDb("returns 400 for a malformed id (not a uuid)", async () => {
      const res = await get("/api/v1/utilisateurs/not-a-uuid");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/utilisateurs", () => {
    itDb("returns a paginated envelope", async () => {
      const id = identifiant("list");
      await post("/api/v1/utilisateurs").send({ identifiant: id, motDePasse: "Password123" });

      const res = await get("/api/v1/utilisateurs?page=1&pageSize=5");

      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 5 });
      expect(typeof res.body.pagination.total).toBe("number");
      expect(typeof res.body.pagination.totalPages).toBe("number");
      expect(Array.isArray(res.body.utilisateurs)).toBe(true);
      for (const u of res.body.utilisateurs) {
        expect(u).not.toHaveProperty("motDePasseHash");
      }
    });

    itDb("filters by recherche (identifiant match)", async () => {
      const id = identifiant("search-target");
      await post("/api/v1/utilisateurs").send({ identifiant: id, motDePasse: "Password123" });

      const res = await get(`/api/v1/utilisateurs?recherche=${id}`);

      expect(res.status).toBe(200);
      expect(res.body.utilisateurs.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.utilisateurs.every((u: { identifiant: string }) => u.identifiant.includes(id)),
      ).toBe(true);
    });

    itDb("caps pageSize at 100", async () => {
      const res = await get("/api/v1/utilisateurs?pageSize=1000");
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/v1/utilisateurs/:id", () => {
    itDb("performs a full update", async () => {
      const id = identifiant("put");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });
      const newIdentifiant = identifiant("put-renamed");

      const res = await put(`/api/v1/utilisateurs/${created.body.utilisateur.uuid}`).send({
        identifiant: newIdentifiant,
        email: `${newIdentifiant}@example.com`,
      });

      expect(res.status).toBe(200);
      expect(res.body.utilisateur.identifiant).toBe(newIdentifiant);
      expect(res.body.utilisateur.email).toBe(`${newIdentifiant}@example.com`);
      // Identity (uuid) is preserved across a PUT — never recreated.
      expect(res.body.utilisateur.uuid).toBe(created.body.utilisateur.uuid);
    });

    itDb("returns 404 when updating a nonexistent user", async () => {
      const res = await put("/api/v1/utilisateurs/11111111-1111-4111-8111-111111111111").send({
        identifiant: identifiant("put-missing"),
      });
      expect(res.status).toBe(404);
    });

    itDb("has no PATCH route — PATCH falls through to the standard 404", async () => {
      const id = identifiant("no-patch");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });

      const res = await request(app)
        .patch(`/api/v1/utilisateurs/${created.body.utilisateur.uuid}`)
        .send({ identifiant: "irrelevant" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Lifecycle: POST /:id/desactiver and /:id/reactiver", () => {
    itDb("deactivates a user (actif=false, supprime=true) without deleting the row", async () => {
      const id = identifiant("deactivate");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });
      const uuid = created.body.utilisateur.uuid;

      const res = await post(`/api/v1/utilisateurs/${uuid}/desactiver`);

      expect(res.status).toBe(200);
      expect(res.body.utilisateur).toMatchObject({ actif: false, supprime: true });
      expect(res.body.utilisateur.supprimeLe).not.toBeNull();

      const stillInDb = await prisma.utilisateur.findUnique({ where: { uuid } });
      expect(stillInDb).not.toBeNull();
      expect(stillInDb?.identifiant).toBe(id);
    });

    itDb("rejects deactivating the same user twice with 409", async () => {
      const id = identifiant("deactivate-twice");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });
      const uuid = created.body.utilisateur.uuid;
      await post(`/api/v1/utilisateurs/${uuid}/desactiver`);

      const res = await post(`/api/v1/utilisateurs/${uuid}/desactiver`);

      expect(res.status).toBe(409);
    });

    itDb("excludes a deactivated user from the default list", async () => {
      const id = identifiant("hidden-from-list");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });
      await post(`/api/v1/utilisateurs/${created.body.utilisateur.uuid}/desactiver`);

      const res = await get(`/api/v1/utilisateurs?recherche=${id}`);

      expect(res.body.utilisateurs).toHaveLength(0);
    });

    itDb("still finds a deactivated user with inclureSupprimes=true", async () => {
      const id = identifiant("visible-with-flag");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });
      await post(`/api/v1/utilisateurs/${created.body.utilisateur.uuid}/desactiver`);

      const res = await get(`/api/v1/utilisateurs?recherche=${id}&inclureSupprimes=true`);

      expect(res.body.utilisateurs).toHaveLength(1);
      expect(res.body.utilisateurs[0].supprime).toBe(true);
    });

    itDb("blocks PUT on a deactivated user until reactivated", async () => {
      const id = identifiant("blocked-put");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });
      const uuid = created.body.utilisateur.uuid;
      await post(`/api/v1/utilisateurs/${uuid}/desactiver`);

      const res = await put(`/api/v1/utilisateurs/${uuid}`).send({
        identifiant: identifiant("blocked-put-renamed"),
      });

      expect(res.status).toBe(409);
    });

    itDb("reactivates a deactivated user in place (same uuid, same row)", async () => {
      const id = identifiant("reactivate");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });
      const uuid = created.body.utilisateur.uuid;
      await post(`/api/v1/utilisateurs/${uuid}/desactiver`);

      const res = await post(`/api/v1/utilisateurs/${uuid}/reactiver`);

      expect(res.status).toBe(200);
      expect(res.body.utilisateur).toMatchObject({
        uuid,
        identifiant: id,
        actif: true,
        supprime: false,
      });
      expect(res.body.utilisateur.supprimeLe).toBeNull();
    });

    itDb("rejects reactivating an already-active user with 409", async () => {
      const id = identifiant("reactivate-active");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });

      const res = await post(`/api/v1/utilisateurs/${created.body.utilisateur.uuid}/reactiver`);

      expect(res.status).toBe(409);
    });
  });

  describe("No physical deletion is possible through the API", () => {
    itDb(
      "has no DELETE route — it falls through to the standard 404, and the row survives",
      async () => {
        const id = identifiant("no-delete");
        const created = await post("/api/v1/utilisateurs").send({
          identifiant: id,
          motDePasse: "Password123",
        });
        const uuid = created.body.utilisateur.uuid;

        const res = await asAdmin(request(app).delete(`/api/v1/utilisateurs/${uuid}`));

        expect(res.status).toBe(404);
        const stillInDb = await prisma.utilisateur.findUnique({ where: { uuid } });
        expect(stillInDb).not.toBeNull();
      },
    );

    itDb(
      "row count never decreases across a full create → desactiver → reactiver cycle",
      async () => {
        // Scoped to this file's own RUN_PREFIX — other test files create/delete
        // `Utilisateur` rows concurrently (test files run in parallel), so a
        // table-wide count would be flaky under that unrelated churn.
        const countScoped = () =>
          prisma.utilisateur.count({ where: { identifiant: { startsWith: RUN_PREFIX } } });
        const countBefore = await countScoped();
        const id = identifiant("count-stable");
        const created = await post("/api/v1/utilisateurs").send({
          identifiant: id,
          motDePasse: "Password123",
        });
        const uuid = created.body.utilisateur.uuid;

        await post(`/api/v1/utilisateurs/${uuid}/desactiver`);
        const countAfterDeactivate = await countScoped();
        await post(`/api/v1/utilisateurs/${uuid}/reactiver`);
        const countAfterReactivate = await countScoped();

        expect(countAfterDeactivate).toBe(countBefore + 1);
        expect(countAfterReactivate).toBe(countBefore + 1);
      },
    );
  });

  describe("Permissions — réservé aux administrateurs", () => {
    itDb("rejects POST without a token with 401", async () => {
      const res = await request(app)
        .post("/api/v1/utilisateurs")
        .send({ identifiant: identifiant("no-token"), motDePasse: "Password123" });
      expect(res.status).toBe(401);
    });

    itDb("rejects POST from a membre (non-admin) with 403", async () => {
      const res = await request(app)
        .post("/api/v1/utilisateurs")
        .set("Authorization", `Bearer ${tokenMembre}`)
        .send({ identifiant: identifiant("membre-blocked"), motDePasse: "Password123" });
      expect(res.status).toBe(403);
    });

    itDb("rejects GET list without a token with 401", async () => {
      const res = await request(app).get("/api/v1/utilisateurs");
      expect(res.status).toBe(401);
    });

    itDb("rejects GET list from a membre with 403", async () => {
      const res = await request(app)
        .get("/api/v1/utilisateurs")
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(res.status).toBe(403);
    });

    itDb("rejects desactiver from a membre with 403", async () => {
      const id = identifiant("membre-desactiver-blocked");
      const created = await post("/api/v1/utilisateurs").send({
        identifiant: id,
        motDePasse: "Password123",
      });

      const res = await request(app)
        .post(`/api/v1/utilisateurs/${created.body.utilisateur.uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(res.status).toBe(403);
    });
  });
});
