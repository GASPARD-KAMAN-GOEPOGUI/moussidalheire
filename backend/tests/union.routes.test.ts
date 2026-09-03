import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb` — CRUD `unions` +
 * les règles métier posées par union.service.ts (epouxId !==
 * epouseId, et les deux personnes doivent réellement exister) +
 * permissions : lecture publique, toute mutation exige un compte
 * authentifié (`requireAuth`, pas de rôle particulier — tout membre peut
 * déclarer une union). Même convention que les autres suites : fixture par
 * run, cleanup dans `afterAll`, no-op pass si MySQL n'est pas joignable.
 */

const app = createApp();
const RUN_PREFIX = `test_union_${Date.now()}`;

let dbAvailable = false;
let familleTestId: number;
let epouxTestId: number;
let epouseTestId: number;
let autreEpouseTestId: number;
const utilisateurIds: number[] = [];
let tokenMembre: string;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;
  const famille = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX}` } });
  familleTestId = famille.id;

  const a = await prisma.personne.create({
    data: { prenom: "A", nom: RUN_PREFIX, sexe: "homme", familleId: familleTestId },
  });
  epouxTestId = a.id;
  const b = await prisma.personne.create({
    data: { prenom: "B", nom: RUN_PREFIX, sexe: "femme", familleId: familleTestId },
  });
  epouseTestId = b.id;
  const c = await prisma.personne.create({
    data: { prenom: "C", nom: RUN_PREFIX, sexe: "femme", familleId: familleTestId },
  });
  autreEpouseTestId = c.id;

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
  await prisma.union.deleteMany({ where: { epouxId: epouxTestId } });
  await prisma.personne.deleteMany({ where: { familleId: familleTestId } });
  await prisma.famille.delete({ where: { id: familleTestId } });
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

const nouvelleUnion = (overrides: Record<string, unknown> = {}) => ({
  epouxId: epouxTestId,
  epouseId: epouseTestId,
  statut: "marie",
  ...overrides,
});

function creerUnion(donnees: Record<string, unknown> = nouvelleUnion()) {
  return request(app)
    .post("/api/v1/unions")
    .set("Authorization", `Bearer ${tokenMembre}`)
    .send(donnees);
}

describe("Unions API", () => {
  describe("CRUD (membre authentifié)", () => {
    itDb("creates a union", async () => {
      const res = await creerUnion();
      expect(res.status).toBe(201);
      expect(res.body.union.epouxId).toBe(epouxTestId);
      expect(res.body.union.epouseId).toBe(epouseTestId);
      expect(res.body.union.statut).toBe("marie");
    });

    itDb("lists unions filtered by personneId (matches either side)", async () => {
      await creerUnion();
      const res = await request(app)
        .get(`/api/v1/unions?personneId=${epouxTestId}`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(res.status).toBe(200);
      expect(res.body.unions.length).toBeGreaterThanOrEqual(1);
    });

    itDb("gets a union by uuid", async () => {
      const created = await creerUnion();
      const res = await request(app)
        .get(`/api/v1/unions/${created.body.union.uuid}`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(res.status).toBe(200);
      expect(res.body.union.uuid).toBe(created.body.union.uuid);
    });

    itDb("updates a union", async () => {
      const created = await creerUnion();
      const res = await request(app)
        .put(`/api/v1/unions/${created.body.union.uuid}`)
        .set("Authorization", `Bearer ${tokenMembre}`)
        .send(nouvelleUnion({ statut: "divorce" }));
      expect(res.status).toBe(200);
      expect(res.body.union.statut).toBe("divorce");
    });

    itDb("desactive puis restaure une union", async () => {
      const created = await creerUnion();
      const uuid = created.body.union.uuid;

      const desactivee = await request(app)
        .post(`/api/v1/unions/${uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(desactivee.status).toBe(200);
      expect(desactivee.body.union.deletedAt).not.toBeNull();

      const restauree = await request(app)
        .post(`/api/v1/unions/${uuid}/restaurer`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(restauree.status).toBe(200);
      expect(restauree.body.union.deletedAt).toBeNull();
    });
  });

  describe("Règle métier : epouxId !== epouseId", () => {
    itDb("rejects creating a union with the same person on both sides with 409", async () => {
      const res = await creerUnion(nouvelleUnion({ epouseId: epouxTestId }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    itDb("rejects updating a union to the same person on both sides with 409", async () => {
      const created = await creerUnion(nouvelleUnion({ epouseId: autreEpouseTestId }));
      const res = await request(app)
        .put(`/api/v1/unions/${created.body.union.uuid}`)
        .set("Authorization", `Bearer ${tokenMembre}`)
        .send(nouvelleUnion({ epouxId: epouxTestId, epouseId: epouxTestId }));
      expect(res.status).toBe(409);
    });
  });

  describe("Règle métier : les deux personnes doivent exister", () => {
    itDb("rejects creating a union referencing a non-existent personneId with 404", async () => {
      const res = await creerUnion(nouvelleUnion({ epouseId: 999999999 }));
      expect(res.status).toBe(404);
    });

    itDb("rejects updating a union to reference a non-existent personneId with 404", async () => {
      const created = await creerUnion(nouvelleUnion({ epouseId: autreEpouseTestId }));
      const res = await request(app)
        .put(`/api/v1/unions/${created.body.union.uuid}`)
        .set("Authorization", `Bearer ${tokenMembre}`)
        .send(nouvelleUnion({ epouseId: 999999999 }));
      expect(res.status).toBe(404);
    });
  });

  describe("Permissions", () => {
    itDb("allows GET list without a token (lecture publique)", async () => {
      const res = await request(app).get("/api/v1/unions");
      expect(res.status).toBe(200);
    });

    itDb("rejects POST without a token with 401", async () => {
      const res = await request(app).post("/api/v1/unions").send(nouvelleUnion());
      expect(res.status).toBe(401);
    });

    itDb("allows POST from any authenticated membre (pas seulement admin)", async () => {
      const res = await creerUnion();
      expect(res.status).toBe(201);
    });
  });
});
