import { afterAll, describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb`, focused on the
 * `ancetreUuid` enrichment added to `famille.service.ts` (mirrors the same
 * `pereUuid`/`mereUuid`/`familleUuid` addition on `personnes` — see
 * personne.routes.test.ts). The `familles` module itself is thin generic
 * CRUD with no dedicated test file yet; this one stays scoped to the new
 * field rather than backfilling full CRUD coverage.
 */

const app = createApp();
const RUN_PREFIX = `test_famille_${Date.now()}`;

let dbAvailable = false;
const familleIds: number[] = [];
const personneIds: number[] = [];
const utilisateurIds: number[] = [];
/** Partagé par tout le fichier — les routes de mutation (POST/PUT/desactiver/
 * restaurer) sont réservées aux admins depuis la mission RBAC. */
let tokenAdminPartage: string;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;
  const admin = await prisma.utilisateur.create({
    data: {
      identifiant: `${RUN_PREFIX}_admin_partage@example.com`,
      email: `${RUN_PREFIX}_admin_partage@example.com`,
      motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
      role: "admin",
    },
  });
  utilisateurIds.push(admin.id);
  tokenAdminPartage = signerToken({ utilisateurId: admin.id, utilisateurUuid: admin.uuid });
});

afterAll(async () => {
  if (!dbAvailable) return;
  if (utilisateurIds.length > 0) {
    await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
  }
  if (personneIds.length > 0) {
    await prisma.personne.deleteMany({ where: { id: { in: personneIds } } });
  }
  if (familleIds.length > 0) {
    await prisma.famille.deleteMany({ where: { id: { in: familleIds } } });
  }
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

describe("Familles API — ancetreUuid", () => {
  itDb("GET /:id includes ancetreUuid alongside the numeric ancetreId", async () => {
    const familleSansAncetre = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} A` },
    });
    familleIds.push(familleSansAncetre.id);
    const ancetre = await request(app)
      .post("/api/v1/personnes")
      .set("Authorization", `Bearer ${tokenAdminPartage}`)
      .send({
        prenom: "Ancetre",
        nom: `Test-${RUN_PREFIX}`,
        sexe: "homme",
        familleId: familleSansAncetre.id,
      });
    personneIds.push(ancetre.body.personne.id);

    const familleAvecAncetre = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} B`, ancetreId: ancetre.body.personne.id },
    });
    familleIds.push(familleAvecAncetre.id);

    const res = await request(app).get(`/api/v1/familles/${familleAvecAncetre.uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.famille.ancetreId).toBe(ancetre.body.personne.id);
    expect(res.body.famille.ancetreUuid).toBe(ancetre.body.personne.uuid);
  });

  itDb("GET /:id omits ancetreUuid when no ancetreId is set", async () => {
    const famille = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX} C` } });
    familleIds.push(famille.id);

    const res = await request(app).get(`/api/v1/familles/${famille.uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.famille.ancetreId).toBeNull();
    expect(res.body.famille.ancetreUuid).toBeUndefined();
  });

  itDb("GET / (list) includes ancetreUuid on each famille that has an ancetre", async () => {
    const famille = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX} D` } });
    familleIds.push(famille.id);
    const ancetre = await request(app)
      .post("/api/v1/personnes")
      .set("Authorization", `Bearer ${tokenAdminPartage}`)
      .send({
        prenom: "Ancetre2",
        nom: `Test-${RUN_PREFIX}`,
        sexe: "femme",
        familleId: famille.id,
      });
    personneIds.push(ancetre.body.personne.id);
    await prisma.famille.update({
      where: { id: famille.id },
      data: { ancetreId: ancetre.body.personne.id },
    });

    const res = await request(app).get(
      `/api/v1/familles?recherche=${encodeURIComponent(`Famille ${RUN_PREFIX} D`)}`,
    );

    expect(res.status).toBe(200);
    const trouvee = res.body.familles.find((f: { id: number }) => f.id === famille.id);
    expect(trouvee?.ancetreUuid).toBe(ancetre.body.personne.uuid);
  });
});

describe("Familles API — hiérarchie (familleParenteId)", () => {
  itDb(
    "POST creates a famille relative; GET /:id enriches it with familleParenteUuid and estFondatrice=false",
    async () => {
      const fondatrice = await prisma.famille.create({
        data: { nom: `Famille ${RUN_PREFIX} Fondatrice1` },
      });
      familleIds.push(fondatrice.id);

      // Comme ancetreId sur POST /familles, familleParenteId n'est pas enrichi
      // à la création (seuls GET/liste le sont) — voir enrichirAvecUuid.
      const res = await request(app)
        .post("/api/v1/familles")
        .set("Authorization", `Bearer ${tokenAdminPartage}`)
        .send({ nom: `Famille ${RUN_PREFIX} Relative1`, familleParenteId: fondatrice.id });
      if (res.body?.famille?.id) familleIds.push(res.body.famille.id);

      expect(res.status).toBe(201);
      expect(res.body.famille.familleParenteId).toBe(fondatrice.id);

      const relue = await request(app).get(`/api/v1/familles/${res.body.famille.uuid}`);
      expect(relue.body.famille.familleParenteUuid).toBe(fondatrice.uuid);
      expect(relue.body.famille.estFondatrice).toBe(false);
    },
  );

  itDb("POST rejects an unknown familleParenteId with 404", async () => {
    const res = await request(app)
      .post("/api/v1/familles")
      .set("Authorization", `Bearer ${tokenAdminPartage}`)
      .send({ nom: `Famille ${RUN_PREFIX} Orpheline`, familleParenteId: 999_999_999 });

    expect(res.status).toBe(404);
  });

  itDb("GET /:id on a famille with no familleParenteId reports estFondatrice=true", async () => {
    const famille = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} Fondatrice2` },
    });
    familleIds.push(famille.id);

    const res = await request(app).get(`/api/v1/familles/${famille.uuid}`);

    expect(res.body.famille.estFondatrice).toBe(true);
    expect(res.body.famille.familleParenteUuid).toBeUndefined();
  });

  itDb(
    "PUT rejects a familleParenteId change that would create a cycle between familles",
    async () => {
      const a = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX} CycleA` } });
      familleIds.push(a.id);
      const b = await prisma.famille.create({
        data: { nom: `Famille ${RUN_PREFIX} CycleB`, familleParenteId: a.id },
      });
      familleIds.push(b.id);

      // A -> familleParenteId = B, alors que B -> familleParenteId = A déjà : boucle directe.
      const res = await request(app)
        .put(`/api/v1/familles/${a.uuid}`)
        .set("Authorization", `Bearer ${tokenAdminPartage}`)
        .send({ nom: a.nom, familleParenteId: b.id });

      expect(res.status).toBe(409);
    },
  );

  itDb("GET /:id/relatives lists only the direct children of the hierarchy", async () => {
    const fondatrice = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} RelativesRoot` },
    });
    familleIds.push(fondatrice.id);
    const enfant = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} RelativesEnfant`, familleParenteId: fondatrice.id },
    });
    familleIds.push(enfant.id);
    const petitEnfant = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} RelativesPetitEnfant`, familleParenteId: enfant.id },
    });
    familleIds.push(petitEnfant.id);

    const res = await request(app).get(`/api/v1/familles/${fondatrice.uuid}/relatives`);

    expect(res.status).toBe(200);
    expect(res.body.relatives.map((f: { id: number }) => f.id)).toEqual([enfant.id]);
  });

  itDb("GET /:id/chaine remonte de famille relative jusqu'à la famille fondatrice", async () => {
    const a = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX} ChaineA` } });
    familleIds.push(a.id);
    const b = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} ChaineB`, familleParenteId: a.id },
    });
    familleIds.push(b.id);
    const c = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} ChaineC`, familleParenteId: b.id },
    });
    familleIds.push(c.id);

    const res = await request(app).get(`/api/v1/familles/${c.uuid}/chaine`);

    expect(res.status).toBe(200);
    expect(res.body.chaine.map((f: { id: number }) => f.id)).toEqual([c.id, b.id, a.id]);
    expect(res.body.chaine.at(-1).estFondatrice).toBe(true);
  });

  itDb("GET /:id/chaine on a famille fondatrice returns only itself", async () => {
    const famille = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} ChaineSeule` },
    });
    familleIds.push(famille.id);

    const res = await request(app).get(`/api/v1/familles/${famille.uuid}/chaine`);

    expect(res.status).toBe(200);
    expect(res.body.chaine.map((f: { id: number }) => f.id)).toEqual([famille.id]);
  });
});

describe("Familles API — RBAC (visibilité par univers familial)", () => {
  let clanAId: number, clanAUuid: string;
  let clanBId: number;
  let autreClanId: number, autreClanUuid: string;
  let tokenMembre: string;

  beforeAll(async () => {
    if (!dbAvailable) return;

    const clanA = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX} ClanA` } });
    familleIds.push(clanA.id);
    clanAId = clanA.id;
    clanAUuid = clanA.uuid;
    const clanB = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} ClanB`, familleParenteId: clanA.id },
    });
    familleIds.push(clanB.id);
    clanBId = clanB.id;
    const autreClan = await prisma.famille.create({
      data: { nom: `Famille ${RUN_PREFIX} AutreClan` },
    });
    familleIds.push(autreClan.id);
    autreClanId = autreClan.id;
    autreClanUuid = autreClan.uuid;

    const personneMembre = await prisma.personne.create({
      data: {
        matricule: `RB${Date.now() % 1_000_000}`,
        prenom: "Membre",
        nom: "Test",
        sexe: "homme",
        familleId: clanB.id,
        generation: 0,
      },
    });
    personneIds.push(personneMembre.id);
    const utilisateurMembre = await prisma.utilisateur.create({
      data: {
        identifiant: `${RUN_PREFIX}_membre@example.com`,
        email: `${RUN_PREFIX}_membre@example.com`,
        motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
        personneId: personneMembre.id,
        role: "membre",
      },
    });
    utilisateurIds.push(utilisateurMembre.id);
    tokenMembre = signerToken({
      utilisateurId: utilisateurMembre.id,
      utilisateurUuid: utilisateurMembre.uuid,
    });
  });

  itDb(
    "no token: public behaviour unchanged — sees every famille (scénario Nouveau membre)",
    async () => {
      const res = await request(app).get(`/api/v1/familles/${autreClanUuid}`);
      expect(res.status).toBe(200);
    },
  );

  itDb("membre connecté voit une famille de son propre clan", async () => {
    const res = await request(app)
      .get(`/api/v1/familles/${clanAUuid}`)
      .set("Authorization", `Bearer ${tokenMembre}`);
    expect(res.status).toBe(200);
  });

  itDb("membre connecté reçoit 403 sur une famille d'un autre clan", async () => {
    const res = await request(app)
      .get(`/api/v1/familles/${autreClanUuid}`)
      .set("Authorization", `Bearer ${tokenMembre}`);
    expect(res.status).toBe(403);
  });

  itDb("membre connecté : la liste exclut les familles d'un autre clan", async () => {
    const res = await request(app)
      .get(`/api/v1/familles?pageSize=100`)
      .set("Authorization", `Bearer ${tokenMembre}`);
    const ids = res.body.familles.map((f: { id: number }) => f.id);
    expect(ids).toContain(clanAId);
    expect(ids).toContain(clanBId);
    expect(ids).not.toContain(autreClanId);
  });

  itDb("admin connecté voit une famille de n'importe quel clan", async () => {
    const res = await request(app)
      .get(`/api/v1/familles/${autreClanUuid}`)
      .set("Authorization", `Bearer ${tokenAdminPartage}`);
    expect(res.status).toBe(200);
  });

  itDb("POST /familles sans token est refusé (401)", async () => {
    const res = await request(app)
      .post("/api/v1/familles")
      .send({ nom: `Famille ${RUN_PREFIX} SansToken` });
    expect(res.status).toBe(401);
  });

  itDb("POST /familles en tant que membre est refusé (403)", async () => {
    const res = await request(app)
      .post("/api/v1/familles")
      .set("Authorization", `Bearer ${tokenMembre}`)
      .send({ nom: `Famille ${RUN_PREFIX} EnTantQueMembre` });
    expect(res.status).toBe(403);
  });

  itDb("POST /familles en tant qu'admin réussit (201)", async () => {
    const res = await request(app)
      .post("/api/v1/familles")
      .set("Authorization", `Bearer ${tokenAdminPartage}`)
      .send({ nom: `Famille ${RUN_PREFIX} EnTantQuAdmin` });
    if (res.body?.famille?.id) familleIds.push(res.body.famille.id);
    expect(res.status).toBe(201);
  });
});
