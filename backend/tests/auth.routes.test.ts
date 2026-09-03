import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { signerToken } from "@/utils/jwt";

/**
 * Integration tests against the real MySQL `villagedb` — full self-registration
 * → auto-login → next-login flow, plus the negative paths (wrong password,
 * deactivated account, duplicate email). Same conventions as
 * tests/personne.routes.test.ts: a per-run fixture family, cleanup via
 * `deleteMany`/`delete` in this file's own `afterAll`, no-op pass (not a
 * failure) if MySQL isn't reachable.
 */

const app = createApp();
const RUN_PREFIX = `test_auth_${Date.now()}`;
let seq = 0;
function emailUnique(): string {
  seq += 1;
  return `${RUN_PREFIX}_${seq}@example.com`;
}

let dbAvailable = false;
let familleTestId: number;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
  if (!dbAvailable) return;
  const famille = await prisma.famille.create({ data: { nom: `Famille ${RUN_PREFIX}` } });
  familleTestId = famille.id;
});

afterAll(async () => {
  if (!dbAvailable) return;
  const personnes = await prisma.personne.findMany({ where: { familleId: familleTestId } });
  const ids = personnes.map((p) => p.id);
  await prisma.utilisateur.deleteMany({ where: { personneId: { in: ids } } });
  // Unions créées par ce fichier (père↔mère, membre↔conjoint) référencent ces
  // personnes — à supprimer avant les personnes elles-mêmes, sinon elles
  // restent orphelines en base indéfiniment (aucune cascade n'existe côté schéma).
  await prisma.union.deleteMany({
    where: { OR: [{ epouxId: { in: ids } }, { epouseId: { in: ids } }] },
  });
  await prisma.personne.deleteMany({ where: { familleId: familleTestId } });
  await prisma.famille.delete({ where: { id: familleTestId } });
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

const nouvelleInscription = (overrides: Record<string, unknown> = {}) => {
  seq += 1;
  return {
    prenom: "Amadou",
    nom: `Test${seq}`,
    sexe: "homme",
    email: emailUnique(),
    familleId: familleTestId,
    ...overrides,
  };
};

describe("Auth API", () => {
  describe("POST /api/v1/auth/inscription", () => {
    itDb("creates a personne + utilisateur and returns a usable token (auto-login)", async () => {
      const donnees = nouvelleInscription();

      const res = await request(app).post("/api/v1/auth/inscription").send(donnees);

      expect(res.status).toBe(201);
      expect(res.body.personne.prenom).toBe("Amadou");
      expect(res.body.utilisateur.identifiant).toBe(donnees.email);
      expect(typeof res.body.token).toBe("string");

      // Sans père/mère/fratrie/unions déclarés, une seule personne (le
      // membre) a réellement été créée — aucun compte annexe (TEST 1).
      expect(res.body.pere).toBeUndefined();
      expect(res.body.mere).toBeUndefined();
      expect(res.body.fratrie).toEqual([]);
      expect(res.body.unions).toEqual([]);
      expect(res.body.enfantsAutres).toEqual([]);
      expect(res.body.fratrieMeresCreees).toEqual([]);

      // The returned token must work immediately — no forced trip through /connexion.
      const moi = await request(app)
        .get("/api/v1/auth/moi")
        .set("Authorization", `Bearer ${res.body.token}`);
      expect(moi.status).toBe(200);
      expect(moi.body.utilisateur.id).toBe(res.body.utilisateur.id);
    });

    itDb(
      "returns the generated password once (for the one-time credentials modal), never its hash",
      async () => {
        const res = await request(app).post("/api/v1/auth/inscription").send(nouvelleInscription());

        expect(res.body.utilisateur).not.toHaveProperty("motDePasseHash");
        expect(res.body.utilisateur).not.toHaveProperty("motDePasse");
        expect(typeof res.body.motDePasseTemporaire).toBe("string");
        expect(res.body.motDePasseTemporaire.length).toBeGreaterThan(0);
        expect(JSON.stringify(res.body)).not.toContain("motDePasseHash");
      },
    );

    itDb("stores only a bcrypt hash, never the plaintext password, in MySQL", async () => {
      const res = await request(app).post("/api/v1/auth/inscription").send(nouvelleInscription());

      const enBase = await prisma.utilisateur.findUnique({
        where: { id: res.body.utilisateur.id },
      });
      expect(enBase?.motDePasseHash).toMatch(/^\$2[aby]\$/);
    });

    itDb("rejects a duplicate email with 409", async () => {
      const donnees = nouvelleInscription();
      await request(app).post("/api/v1/auth/inscription").send(donnees);

      const res = await request(app)
        .post("/api/v1/auth/inscription")
        .send({ ...donnees, nom: "Autre" });

      expect(res.status).toBe(409);
    });

    itDb("rejects an unknown familleId with 404", async () => {
      const res = await request(app)
        .post("/api/v1/auth/inscription")
        .send(nouvelleInscription({ familleId: 999_999_999 }));

      expect(res.status).toBe(404);
    });

    itDb(
      "creates an account without email — identifiant falls back to the assigned matricule",
      async () => {
        const res = await request(app)
          .post("/api/v1/auth/inscription")
          .send({ prenom: "X", nom: `Test${seq}`, sexe: "homme", familleId: familleTestId });

        expect(res.status).toBe(201);
        expect(res.body.utilisateur.email).toBeNull();
        expect(res.body.personne.matricule).toBeTruthy();
        expect(res.body.utilisateur.identifiant).toBe(res.body.personne.matricule);
      },
    );

    itDb(
      "creates père, mère and a union's conjoint+enfant on the fly, each with a distinct matricule, unites père+mère, and creates the union's Union (TESTS 3, 9)",
      async () => {
        const donnees = nouvelleInscription({
          statutMatrimonial: "marie",
          pere: { mode: "nouveau", donnees: { prenom: "Pere", nom: `Test${seq}`, sexe: "homme" } },
          mere: { mode: "nouveau", donnees: { prenom: "Mere", nom: `Test${seq}`, sexe: "femme" } },
          unions: [
            {
              conjoint: {
                mode: "nouveau",
                donnees: { prenom: "Conjoint", nom: `TestC${seq}`, sexe: "femme" },
              },
              enfants: [
                {
                  mode: "nouveau",
                  donnees: { prenom: "Enfant", nom: `TestE${seq}`, sexe: "homme" },
                },
              ],
            },
          ],
        });

        const res = await request(app).post("/api/v1/auth/inscription").send(donnees);

        expect(res.status).toBe(201);
        expect(res.body.pere.cree).toBe(true);
        expect(res.body.mere.cree).toBe(true);
        expect(res.body.unions).toHaveLength(1);
        expect(res.body.unions[0].conjoint.cree).toBe(true);
        expect(res.body.unions[0].enfants).toHaveLength(1);
        expect(res.body.unions[0].enfants[0].cree).toBe(true);
        expect(res.body.personne.generation).toBe(1);
        expect(res.body.personne.pereId).toBe(res.body.pere.id);
        expect(res.body.personne.mereId).toBe(res.body.mere.id);

        const matricules = [
          res.body.personne.matricule,
          res.body.pere.matricule,
          res.body.mere.matricule,
          res.body.unions[0].conjoint.matricule,
          res.body.unions[0].enfants[0].matricule,
        ];
        expect(new Set(matricules).size).toBe(5);

        // Chaque personne créée à la volée reçoit son propre compte, avec
        // son propre mot de passe temporaire — jamais celui du membre.
        for (const liee of [
          res.body.pere,
          res.body.mere,
          res.body.unions[0].conjoint,
          res.body.unions[0].enfants[0],
        ]) {
          expect(liee.compte.identifiant).toBe(liee.matricule);
          expect(typeof liee.compte.motDePasseTemporaire).toBe("string");
          expect(liee.compte.motDePasseTemporaire.length).toBeGreaterThan(0);
        }
        const motsDePasse = new Set([
          res.body.motDePasseTemporaire,
          res.body.pere.compte.motDePasseTemporaire,
          res.body.mere.compte.motDePasseTemporaire,
          res.body.unions[0].conjoint.compte.motDePasseTemporaire,
          res.body.unions[0].enfants[0].compte.motDePasseTemporaire,
        ]);
        expect(motsDePasse.size).toBe(5);

        // Le compte du père (identifiant = matricule, pas d'e-mail fourni)
        // fonctionne réellement pour se connecter.
        const connexionPere = await request(app).post("/api/v1/auth/connexion").send({
          identifiant: res.body.pere.matricule,
          motDePasse: res.body.pere.compte.motDePasseTemporaire,
        });
        expect(connexionPere.status).toBe(200);
        expect(connexionPere.body.utilisateur.personneId).toBe(res.body.pere.id);

        // Le membre (homme) et sa conjointe (femme) sont bien les deux parents de l'enfant.
        const enfantEnBase = await prisma.personne.findUnique({
          where: { id: res.body.unions[0].enfants[0].id },
        });
        expect(enfantEnBase?.pereId).toBe(res.body.personne.id);
        expect(enfantEnBase?.mereId).toBe(res.body.unions[0].conjoint.id);
        expect(enfantEnBase?.generation).toBe(2);

        const unionMembre = await prisma.union.findUnique({
          where: { uuid: res.body.unions[0].unionUuid },
        });
        expect(unionMembre?.statut).toBe("marie");
        expect(unionMembre?.epouxId).toBe(res.body.personne.id);
        expect(unionMembre?.epouseId).toBe(res.body.unions[0].conjoint.id);

        // Père et mère, de fait conjoints, sont automatiquement unis.
        const unionParents = await prisma.union.findFirst({
          where: {
            deletedAt: null,
            epouxId: res.body.pere.id,
            epouseId: res.body.mere.id,
          },
        });
        expect(unionParents?.statut).toBe("marie");
      },
    );

    itDb(
      "attaches an existing sibling with no prior parents, and rejects one with a conflicting père (TESTS 2, 5, 11)",
      async () => {
        const donneesPreexistant = nouvelleInscription();
        const preexistant = await request(app)
          .post("/api/v1/auth/inscription")
          .send(donneesPreexistant);
        expect(preexistant.status).toBe(201);
        const fratrieLibreId = preexistant.body.personne.id as number;

        const donnees = nouvelleInscription({
          pere: {
            mode: "nouveau",
            donnees: { prenom: "PereFratrie", nom: `TestPF${seq}`, sexe: "homme" },
          },
          fratrie: [{ mode: "existant", id: fratrieLibreId }],
        });
        const res = await request(app).post("/api/v1/auth/inscription").send(donnees);

        expect(res.status).toBe(201);
        expect(res.body.fratrie[0]).toMatchObject({ id: fratrieLibreId, cree: false });
        // Une personne déjà existante, simplement rattachée, ne reçoit jamais
        // de nouveau compte (TEST 4 de la mission credentials).
        expect(res.body.fratrie[0].compte).toBeUndefined();

        const fratrieEnBase = await prisma.personne.findUnique({ where: { id: fratrieLibreId } });
        expect(fratrieEnBase?.pereId).toBe(res.body.pere.id);

        // Un deuxième membre déclare aussi ce même fratrie comme sien, mais avec
        // un père différent (déjà rattaché) — doit être rejeté, jamais écrasé.
        const donneesConflit = nouvelleInscription({
          pere: {
            mode: "nouveau",
            donnees: { prenom: "AutrePere", nom: `TestAP${seq}`, sexe: "homme" },
          },
          fratrie: [{ mode: "existant", id: fratrieLibreId }],
        });
        const resConflit = await request(app).post("/api/v1/auth/inscription").send(donneesConflit);
        expect(resConflit.status).toBe(409);

        const fratrieInchange = await prisma.personne.findUnique({ where: { id: fratrieLibreId } });
        expect(fratrieInchange?.pereId).toBe(res.body.pere.id); // toujours le premier père, jamais écrasé
      },
    );

    itDb(
      "demi-frère : creates a sibling with the same père but a different mère (TEST 6)",
      async () => {
        const donnees = nouvelleInscription({
          pere: {
            mode: "nouveau",
            donnees: { prenom: "PerePoly", nom: `TestPP${seq}`, sexe: "homme" },
          },
          mere: {
            mode: "nouveau",
            donnees: { prenom: "MereMembre", nom: `TestMM${seq}`, sexe: "femme" },
          },
          fratrie: [
            {
              mode: "nouveau",
              donnees: { prenom: "DemiFrere", nom: `TestDF${seq}`, sexe: "homme" },
              mere: {
                mode: "nouveau",
                donnees: { prenom: "AutreMere", nom: `TestAM${seq}`, sexe: "femme" },
              },
            },
          ],
        });

        const res = await request(app).post("/api/v1/auth/inscription").send(donnees);

        expect(res.status).toBe(201);
        const demiFrere = await prisma.personne.findUnique({
          where: { id: res.body.fratrie[0].id },
        });
        expect(demiFrere?.pereId).toBe(res.body.pere.id);
        expect(demiFrere?.mereId).not.toBe(res.body.mere.id);

        // La mère du demi-frère, créée à la volée, n'a de place dans aucun
        // des tableaux habituels (ni pere/mere, ni fratrie, ni unions) — elle
        // doit malgré tout apparaître, avec son propre compte.
        expect(res.body.fratrieMeresCreees).toHaveLength(1);
        expect(res.body.fratrieMeresCreees[0].id).toBe(demiFrere?.mereId);
        expect(res.body.fratrieMeresCreees[0].cree).toBe(true);
        expect(res.body.fratrieMeresCreees[0].compte.identifiant).toBe(
          res.body.fratrieMeresCreees[0].matricule,
        );
      },
    );

    itDb(
      "rejects with 409 a duplicate detected on a fratrie entry, and creates nothing",
      async () => {
        const doublon = nouvelleInscription();
        await request(app).post("/api/v1/auth/inscription").send(doublon);

        const donnees = nouvelleInscription({
          fratrie: [
            {
              mode: "nouveau",
              donnees: { prenom: doublon.prenom, nom: doublon.nom, sexe: "homme" },
            },
          ],
        });
        const avant = await prisma.personne.count({ where: { familleId: familleTestId } });

        const res = await request(app).post("/api/v1/auth/inscription").send(donnees);

        expect(res.status).toBe(409);
        const apres = await prisma.personne.count({ where: { familleId: familleTestId } });
        expect(apres).toBe(avant); // rollback complet — rien créé, pas même le membre principal
      },
    );
  });

  describe("POST /api/v1/auth/connexion — next login", () => {
    // Password isn't recoverable from the API/logs by design (see
    // email.service.ts) — this suite creates its own utilisateur directly via
    // Prisma with a known password hash, to test login independently of the
    // registration flow's real (unrecoverable) generated password.
    const motDePasseConnu = "MotDePasseConnu1";
    let personneConnexionId: number;
    let emailConnexion: string;
    let identifiantConnexion: string;

    beforeAll(async () => {
      if (!dbAvailable) return;
      const { hacherMotDePasse } = await import("@/utils/password");
      emailConnexion = emailUnique();
      identifiantConnexion = emailConnexion;
      const personne = await prisma.personne.create({
        data: {
          matricule: `T${Date.now() % 1_000_000}`,
          prenom: "Fatou",
          nom: "Test",
          sexe: "femme",
          email: emailConnexion,
          familleId: familleTestId,
          generation: 0,
        },
      });
      personneConnexionId = personne.id;
      await prisma.utilisateur.create({
        data: {
          identifiant: identifiantConnexion,
          email: emailConnexion,
          motDePasseHash: await hacherMotDePasse(motDePasseConnu),
          personneId: personne.id,
        },
      });
    });

    itDb("logs in with the correct identifiant + password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/connexion")
        .send({ identifiant: identifiantConnexion, motDePasse: motDePasseConnu });

      expect(res.status).toBe(200);
      expect(res.body.utilisateur.identifiant).toBe(identifiantConnexion);
      expect(typeof res.body.token).toBe("string");
    });

    itDb("rejects an incorrect password (scénario D)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/connexion")
        .send({ identifiant: identifiantConnexion, motDePasse: "MauvaisMotDePasse" });

      expect(res.status).toBe(401);
    });

    itDb("rejects a deactivated account (scénario E), even with the correct password", async () => {
      // /utilisateurs/:id/desactiver|reactiver requièrent requireAuth +
      // requireRole("admin") — compte admin jetable, propre à ce test.
      const admin = await prisma.utilisateur.create({
        data: {
          identifiant: `${RUN_PREFIX}_admin_scenarioE@example.com`,
          email: `${RUN_PREFIX}_admin_scenarioE@example.com`,
          motDePasseHash: "$2b$12$placeholderplaceholderplaceholderplace",
          role: "admin",
        },
      });
      const tokenAdmin = signerToken({ utilisateurId: admin.id, utilisateurUuid: admin.uuid });

      const utilisateur = await prisma.utilisateur.findUnique({
        where: { personneId: personneConnexionId },
      });
      await request(app)
        .post(`/api/v1/utilisateurs/${utilisateur?.uuid}/desactiver`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      const res = await request(app)
        .post("/api/v1/auth/connexion")
        .send({ identifiant: identifiantConnexion, motDePasse: motDePasseConnu });

      expect(res.status).toBe(401);

      // Restore so the account isn't left desactivated for any later test run
      // relying on the same fixture pattern, and to confirm reactiver undoes it.
      await request(app)
        .post(`/api/v1/utilisateurs/${utilisateur?.uuid}/reactiver`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      await prisma.utilisateur.delete({ where: { id: admin.id } });
    });

    itDb(
      "rejects an unknown identifiant with 401 (not 404 — avoids account enumeration)",
      async () => {
        const res = await request(app)
          .post("/api/v1/auth/connexion")
          .send({ identifiant: "personne-ne-porte-cet-identifiant", motDePasse: "peu-importe" });

        expect(res.status).toBe(401);
      },
    );
  });

  describe("POST /api/v1/auth/refresh", () => {
    const motDePasseConnu = "MotDePasseRefresh1";
    let identifiantConnexion: string;

    beforeAll(async () => {
      if (!dbAvailable) return;
      const { hacherMotDePasse } = await import("@/utils/password");
      identifiantConnexion = emailUnique();
      const personne = await prisma.personne.create({
        data: {
          matricule: `T${Date.now() % 1_000_000}`,
          prenom: "Refresh",
          nom: "Test",
          sexe: "homme",
          email: identifiantConnexion,
          familleId: familleTestId,
          generation: 0,
        },
      });
      await prisma.utilisateur.create({
        data: {
          identifiant: identifiantConnexion,
          email: identifiantConnexion,
          motDePasseHash: await hacherMotDePasse(motDePasseConnu),
          personneId: personne.id,
        },
      });
    });

    itDb("exchanges a valid refresh token for a fresh, usable token pair", async () => {
      const connexionRes = await request(app)
        .post("/api/v1/auth/connexion")
        .send({ identifiant: identifiantConnexion, motDePasse: motDePasseConnu });
      expect(connexionRes.status).toBe(200);
      expect(typeof connexionRes.body.refreshToken).toBe("string");

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: connexionRes.body.refreshToken });

      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
      expect(typeof res.body.refreshToken).toBe("string");

      // The freshly issued access token must actually work against a
      // protected route — the whole point of this endpoint.
      const moi = await request(app)
        .get("/api/v1/auth/moi")
        .set("Authorization", `Bearer ${res.body.token}`);
      expect(moi.status).toBe(200);
    });

    itDb("rejects an access token presented as a refresh token", async () => {
      const connexionRes = await request(app)
        .post("/api/v1/auth/connexion")
        .send({ identifiant: identifiantConnexion, motDePasse: motDePasseConnu });

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: connexionRes.body.token });

      expect(res.status).toBe(401);
    });

    itDb("rejects a malformed refresh token with 401", async () => {
      const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: "not-a-jwt" });
      expect(res.status).toBe(401);
    });

    itDb("rejects a missing refreshToken with a validation error", async () => {
      const res = await request(app).post("/api/v1/auth/refresh").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/auth/moi", () => {
    itDb("rejects a missing token with 401", async () => {
      const res = await request(app).get("/api/v1/auth/moi");
      expect(res.status).toBe(401);
    });

    itDb("rejects a malformed token with 401", async () => {
      const res = await request(app)
        .get("/api/v1/auth/moi")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/auth/mot-de-passe", () => {
    itDb("rejects a missing token with 401", async () => {
      const res = await request(app).post("/api/v1/auth/mot-de-passe").send({
        nouveauMotDePasse: "NouveauMotDePasse99",
      });
      expect(res.status).toBe(401);
    });

    itDb(
      "changes the password: old password stops working, new one lets the user log back in — no current password required",
      async () => {
        const donnees = nouvelleInscription();
        const inscription = await request(app).post("/api/v1/auth/inscription").send(donnees);
        const { token, motDePasseTemporaire } = inscription.body;

        const changement = await request(app)
          .post("/api/v1/auth/mot-de-passe")
          .set("Authorization", `Bearer ${token}`)
          .send({ nouveauMotDePasse: "NouveauMotDePasse99" });
        expect(changement.status).toBe(200);

        const connexionAncien = await request(app)
          .post("/api/v1/auth/connexion")
          .send({ identifiant: donnees.email, motDePasse: motDePasseTemporaire });
        expect(connexionAncien.status).toBe(401);

        const connexionNouveau = await request(app)
          .post("/api/v1/auth/connexion")
          .send({ identifiant: donnees.email, motDePasse: "NouveauMotDePasse99" });
        expect(connexionNouveau.status).toBe(200);
      },
    );

    itDb("rejects a new password identical to the current one with 409", async () => {
      const donnees = nouvelleInscription();
      const inscription = await request(app).post("/api/v1/auth/inscription").send(donnees);
      const { token, motDePasseTemporaire } = inscription.body;

      const res = await request(app)
        .post("/api/v1/auth/mot-de-passe")
        .set("Authorization", `Bearer ${token}`)
        .send({ nouveauMotDePasse: motDePasseTemporaire });
      expect(res.status).toBe(409);
    });

    itDb("rejects a new password that is too weak with 400", async () => {
      const donnees = nouvelleInscription();
      const inscription = await request(app).post("/api/v1/auth/inscription").send(donnees);
      const { token } = inscription.body;

      const res = await request(app)
        .post("/api/v1/auth/mot-de-passe")
        .set("Authorization", `Bearer ${token}`)
        .send({ nouveauMotDePasse: "short" });
      expect(res.status).toBe(400);
    });
  });
});
