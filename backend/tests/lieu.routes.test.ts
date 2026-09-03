import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb` — CRUD `lieux` +
 * permissions : lecture publique, créer/modifier réservés à un compte
 * authentifié (tout membre, pas seulement admin — renseigner un lieu
 * manquant fait partie d'ajouter sa propre résidence), désactiver/restaurer
 * réservés aux admins. Même convention que les autres suites : fixture par
 * run, cleanup dans `afterAll`, no-op pass si MySQL n'est pas joignable.
 */

const app = createApp();
const RUN_PREFIX = `test_lieu_${Date.now()}`;

let dbAvailable = false;
const utilisateurIds: number[] = [];
const lieuIds: number[] = [];
let tokenMembre: string;
let tokenAdmin: string;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;

  const membre = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_membre`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "membre",
    },
  });
  utilisateurIds.push(membre.id);
  tokenMembre = signerToken({ utilisateurId: membre.id, utilisateurUuid: membre.uuid });

  const admin = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_admin`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "admin",
    },
  });
  utilisateurIds.push(admin.id);
  tokenAdmin = signerToken({ utilisateurId: admin.id, utilisateurUuid: admin.uuid });
});

afterAll(async () => {
  if (!dbAvailable) return;
  await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
  await prisma.lieu.deleteMany({ where: { id: { in: lieuIds } } });
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

function creerLieu(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/lieux")
    .set("Authorization", `Bearer ${tokenMembre}`)
    .send({ pays: "Guinée", ville: `${RUN_PREFIX}_${Date.now()}_${Math.random()}`, ...overrides });
}

describe("Lieux API", () => {
  describe("CRUD (membre authentifié)", () => {
    itDb("creates a lieu", async () => {
      const res = await creerLieu();
      expect(res.status).toBe(201);
      lieuIds.push(res.body.lieu.id);
      expect(res.body.lieu.pays).toBe("Guinée");
    });

    itDb("gets a lieu by uuid", async () => {
      const created = await creerLieu();
      lieuIds.push(created.body.lieu.id);
      const res = await request(app).get(`/api/v1/lieux/${created.body.lieu.uuid}`);
      expect(res.status).toBe(200);
      expect(res.body.lieu.uuid).toBe(created.body.lieu.uuid);
    });

    itDb("lists lieux filtered by recherche (ville/pays)", async () => {
      const created = await creerLieu({ ville: `${RUN_PREFIX}_recherchable` });
      lieuIds.push(created.body.lieu.id);
      const res = await request(app).get(`/api/v1/lieux?recherche=${RUN_PREFIX}_recherchable`);
      expect(res.status).toBe(200);
      expect(res.body.lieux.some((l: { uuid: string }) => l.uuid === created.body.lieu.uuid)).toBe(true);
    });

    itDb("updates a lieu", async () => {
      const created = await creerLieu();
      lieuIds.push(created.body.lieu.id);
      const res = await request(app)
        .put(`/api/v1/lieux/${created.body.lieu.uuid}`)
        .set("Authorization", `Bearer ${tokenMembre}`)
        .send({ pays: "France", ville: created.body.lieu.ville });
      expect(res.status).toBe(200);
      expect(res.body.lieu.pays).toBe("France");
    });

    itDb("desactive puis restaure un lieu (admin)", async () => {
      const created = await creerLieu();
      lieuIds.push(created.body.lieu.id);

      const desactive = await request(app)
        .post(`/api/v1/lieux/${created.body.lieu.uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(desactive.status).toBe(200);
      expect(desactive.body.lieu.deletedAt).not.toBeNull();

      const restaure = await request(app)
        .post(`/api/v1/lieux/${created.body.lieu.uuid}/restaurer`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(restaure.status).toBe(200);
      expect(restaure.body.lieu.deletedAt).toBeNull();
    });
  });

  describe("Permissions", () => {
    itDb("allows GET list without a token (lecture publique)", async () => {
      const res = await request(app).get("/api/v1/lieux");
      expect(res.status).toBe(200);
    });

    itDb("rejects POST without a token with 401", async () => {
      const res = await request(app)
        .post("/api/v1/lieux")
        .send({ pays: "Guinée", ville: `${RUN_PREFIX}_sans_token` });
      expect(res.status).toBe(401);
    });

    itDb("rejects desactiver from a non-admin membre with 403", async () => {
      const created = await creerLieu();
      lieuIds.push(created.body.lieu.id);
      const res = await request(app)
        .post(`/api/v1/lieux/${created.body.lieu.uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(res.status).toBe(403);
    });
  });
});
