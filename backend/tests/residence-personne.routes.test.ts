import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb` — CRUD
 * `residences-personnes` + la règle métier posée par
 * residence-personne.service.ts (au plus une résidence `estActuelle` par
 * personne, les deux personnes/lieux référencés doivent exister) +
 * permissions (lecture publique, mutation réservée à un compte authentifié,
 * désactiver/restaurer réservés aux admins) + l'enrichissement
 * `residenceActuelle` sur `GET /personnes/:id`. Même convention que les
 * autres suites : fixture par run, cleanup dans `afterAll`, no-op pass si
 * MySQL n'est pas joignable.
 */

const app = createApp();
const RUN_PREFIX = `test_residence_${Date.now()}`;

let dbAvailable = false;
let familleTestId: number;
let personneId: number;
let personneUuid: string;
let lieuAId: number;
let lieuBId: number;
const utilisateurIds: number[] = [];
let tokenMembre: string;
let tokenAdmin: string;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;
  const famille = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX}` } });
  familleTestId = famille.id;

  const personne = await prisma.personne.create({
    data: { prenom: "Résident", nom: RUN_PREFIX, sexe: "homme", familleId: familleTestId },
  });
  personneId = personne.id;
  personneUuid = personne.uuid;

  const lieuA = await prisma.lieu.create({
    data: { pays: "Guinée", ville: `${RUN_PREFIX}_A`, estVillage: true },
  });
  lieuAId = lieuA.id;
  const lieuB = await prisma.lieu.create({
    data: { pays: "France", ville: `${RUN_PREFIX}_B`, estVillage: false },
  });
  lieuBId = lieuB.id;

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
  await prisma.residencePersonne.deleteMany({ where: { personneId } });
  await prisma.lieu.deleteMany({ where: { id: { in: [lieuAId, lieuBId] } } });
  await prisma.personne.deleteMany({ where: { familleId: familleTestId } });
  await prisma.famille.delete({ where: { id: familleTestId } });
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

function creerResidence(donnees: Record<string, unknown>) {
  return request(app)
    .post("/api/v1/residences-personnes")
    .set("Authorization", `Bearer ${tokenMembre}`)
    .send(donnees);
}

describe("ResidencesPersonnes API", () => {
  describe("CRUD (membre authentifié)", () => {
    itDb("creates a résidence", async () => {
      const res = await creerResidence({ personneId, lieuId: lieuAId });
      expect(res.status).toBe(201);
      expect(res.body.residence.personneId).toBe(personneId);
      expect(res.body.residence.lieuId).toBe(lieuAId);
    });

    itDb("rejects creating a résidence for a non-existent personneId with 404", async () => {
      const res = await creerResidence({ personneId: 999999999, lieuId: lieuAId });
      expect(res.status).toBe(404);
    });

    itDb("rejects creating a résidence for a non-existent lieuId with 404", async () => {
      const res = await creerResidence({ personneId, lieuId: 999999999 });
      expect(res.status).toBe(404);
    });
  });

  describe("Règle métier : au plus une résidence actuelle par personne", () => {
    itDb("creating a new estActuelle:true résidence unsets the previous one", async () => {
      const premiere = await creerResidence({ personneId, lieuId: lieuAId, estActuelle: true });
      expect(premiere.status).toBe(201);
      expect(premiere.body.residence.estActuelle).toBe(true);

      const seconde = await creerResidence({ personneId, lieuId: lieuBId, estActuelle: true });
      expect(seconde.status).toBe(201);
      expect(seconde.body.residence.estActuelle).toBe(true);

      const premiereRelue = await request(app)
        .get(`/api/v1/residences-personnes/${premiere.body.residence.uuid}`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(premiereRelue.body.residence.estActuelle).toBe(false);

      const liste = await request(app)
        .get(`/api/v1/residences-personnes?personneId=${personneId}&estActuelle=true`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(liste.body.residences).toHaveLength(1);
      expect(liste.body.residences[0].uuid).toBe(seconde.body.residence.uuid);
    });

    itDb("GET /personnes/:id reflects the résidence actuelle", async () => {
      const res = await request(app).get(`/api/v1/personnes/${personneUuid}`);
      expect(res.status).toBe(200);
      expect(res.body.personne.residenceActuelle).toBeDefined();
      expect(res.body.personne.residenceActuelle.ville).toBe(`${RUN_PREFIX}_B`);
    });
  });

  describe("Permissions", () => {
    itDb("allows GET list without a token (lecture publique)", async () => {
      const res = await request(app).get("/api/v1/residences-personnes");
      expect(res.status).toBe(200);
    });

    itDb("rejects POST without a token with 401", async () => {
      const res = await request(app)
        .post("/api/v1/residences-personnes")
        .send({ personneId, lieuId: lieuAId });
      expect(res.status).toBe(401);
    });

    itDb("rejects desactiver from a non-admin membre with 403", async () => {
      const created = await creerResidence({ personneId, lieuId: lieuAId });
      const res = await request(app)
        .post(`/api/v1/residences-personnes/${created.body.residence.uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenMembre}`);
      expect(res.status).toBe(403);
    });

    itDb("allows desactiver puis restaurer from an admin", async () => {
      const created = await creerResidence({ personneId, lieuId: lieuAId });
      const desactivee = await request(app)
        .post(`/api/v1/residences-personnes/${created.body.residence.uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(desactivee.status).toBe(200);
      expect(desactivee.body.residence.deletedAt).not.toBeNull();

      const restauree = await request(app)
        .post(`/api/v1/residences-personnes/${created.body.residence.uuid}/restaurer`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(restauree.status).toBe(200);
      expect(restauree.body.residence.deletedAt).toBeNull();
    });
  });
});
