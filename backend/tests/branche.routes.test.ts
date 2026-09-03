import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb` — CRUD générique pour
 * `branches` (aucune règle métier — voir branche.service.ts) et les
 * permissions posées par cette mission : lecture publique
 * (`attachUtilisateurSiPresent`), écriture réservée aux administrateurs
 * (`requireAuth` + `requireRole("admin")`), même pattern que `familles`. Même
 * convention que les autres suites : fixture par run, cleanup dans
 * `afterAll`, no-op pass si MySQL n'est pas joignable.
 */

const app = createApp();
const RUN_PREFIX = `test_branche_${Date.now()}`;

let dbAvailable = false;
let familleTestId: number;
const utilisateurIds: number[] = [];
let tokenAdmin: string;
let tokenMembre: string;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;
  const famille = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX}` } });
  familleTestId = famille.id;

  const admin = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_admin`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "admin",
    },
  });
  utilisateurIds.push(admin.id);
  tokenAdmin = signerToken({ utilisateurId: admin.id, utilisateurUuid: admin.uuid });

  const membre = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_membre`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "membre",
    },
  });
  utilisateurIds.push(membre.id);
  tokenMembre = signerToken({ utilisateurId: membre.id, utilisateurUuid: membre.uuid });
});

afterAll(async () => {
  if (!dbAvailable) return;
  await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
  await prisma.branche.deleteMany({ where: { familleId: familleTestId } });
  await prisma.famille.delete({ where: { id: familleTestId } });
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

const nouvelleBranche = (overrides: Record<string, unknown> = {}) => ({
  familleId: familleTestId,
  nom: `Branche-${Math.random().toString(36).slice(2, 8)}`,
  ...overrides,
});

function creerBranche(donnees: Record<string, unknown> = nouvelleBranche()) {
  return request(app)
    .post("/api/v1/branches")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .send(donnees);
}

describe("Branches API", () => {
  describe("CRUD (admin)", () => {
    itDb("creates a branche", async () => {
      const res = await creerBranche();
      expect(res.status).toBe(201);
      expect(res.body.branche.nom).toBeDefined();
      expect(res.body.branche.familleId).toBe(familleTestId);
    });

    itDb("lists branches filtered by familleId", async () => {
      await creerBranche();
      const res = await request(app)
        .get(`/api/v1/branches?familleId=${familleTestId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(res.body.branches.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.branches.every((b: { familleId: number }) => b.familleId === familleTestId),
      ).toBe(true);
    });

    itDb("gets a branche by uuid", async () => {
      const created = await creerBranche();
      const res = await request(app)
        .get(`/api/v1/branches/${created.body.branche.uuid}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      expect(res.body.branche.uuid).toBe(created.body.branche.uuid);
    });

    itDb("updates a branche", async () => {
      const created = await creerBranche();
      const res = await request(app)
        .put(`/api/v1/branches/${created.body.branche.uuid}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send(nouvelleBranche({ nom: "Renommée" }));
      expect(res.status).toBe(200);
      expect(res.body.branche.nom).toBe("Renommée");
    });

    itDb("desactive puis restaure une branche", async () => {
      const created = await creerBranche();
      const uuid = created.body.branche.uuid;

      const desactivee = await request(app)
        .post(`/api/v1/branches/${uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(desactivee.status).toBe(200);
      expect(desactivee.body.branche.deletedAt).not.toBeNull();

      const restauree = await request(app)
        .post(`/api/v1/branches/${uuid}/restaurer`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(restauree.status).toBe(200);
      expect(restauree.body.branche.deletedAt).toBeNull();
    });

    itDb("rejects 404 for an unknown familleId", async () => {
      const res = await creerBranche({ familleId: 999_999_999, nom: "X" });
      expect(res.status).toBe(404);
    });
  });

  describe("Permissions", () => {
    itDb("allows GET list without a token (lecture publique)", async () => {
      const res = await request(app).get("/api/v1/branches");
      expect(res.status).toBe(200);
    });

    itDb("rejects POST without a token with 401", async () => {
      const res = await request(app).post("/api/v1/branches").send(nouvelleBranche());
      expect(res.status).toBe(401);
    });

    itDb("rejects POST from a membre (non-admin) with 403", async () => {
      const res = await request(app)
        .post("/api/v1/branches")
        .set("Authorization", `Bearer ${tokenMembre}`)
        .send(nouvelleBranche());
      expect(res.status).toBe(403);
    });

    itDb("rejects desactiver from a membre with 403", async () => {
      const created = await creerBranche();
      const res = await request(app)
        .post(`/api/v1/branches/${created.body.branche.uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(res.status).toBe(403);
    });
  });
});
