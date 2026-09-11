import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "@/app";
import { prisma, checkDatabaseConnection } from "@/config/database";
import { env } from "@/config/env";
import { hacherMotDePasse, verifierMotDePasse } from "@/utils/password";
import { ALPHABET_CODE, LONGUEUR_CODE, genererCode, normaliserCode } from "@/utils/code-otp";
import { jetonRevoque } from "@/utils/jwt";
import { envoyerEmailCodeReinitialisation } from "@/services/email.service";

/**
 * Mot de passe oublié : génération du code, trois endpoints, révocation des
 * sessions.
 *
 * Tests d'intégration contre la vraie base `villagedb`, sauf l'envoi d'e-mail,
 * simulé : sans ça, les tests enverraient de vrais messages dès que SMTP est
 * configuré. Le mock sert aussi à récupérer le code, qui n'existe en clair
 * nulle part ailleurs — la base n'en garde que le hash.
 */
vi.mock("@/services/email.service");

const app = createApp();
const RUN_PREFIX = `reset_${Date.now()}_`;
const MOT_DE_PASSE_INITIAL = "Initial123";
const NOUVEAU_MOT_DE_PASSE = "Nouveau456";
const API = "/api/v1/auth";

let dbAvailable = false;

beforeAll(async () => {
  dbAvailable = (await checkDatabaseConnection()) === "connected";
});

afterAll(async () => {
  if (!dbAvailable) return;
  // Cascade : les codes de réinitialisation partent avec les comptes.
  await prisma.utilisateur.deleteMany({ where: { identifiant: { startsWith: RUN_PREFIX } } });
});

function itDb(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });
}

/**
 * Une adresse IP distincte par appel : les limiteurs de débit (3 à 10 appels
 * par quart d'heure) comptent par IP, et tous les tests partagent le même
 * processus. `trust proxy` étant réglé sur 1, Express retient la valeur
 * d'`X-Forwarded-For`.
 */
let sequenceIp = 0;
function nouvelleIp(): string {
  sequenceIp += 1;
  return `10.77.${Math.floor(sequenceIp / 250)}.${(sequenceIp % 250) + 1}`;
}

let sequenceCompte = 0;
async function creerCompte(options: { email?: string | null } = {}) {
  sequenceCompte += 1;
  const identifiant = `${RUN_PREFIX}${sequenceCompte}`;
  const email = options.email === undefined ? `${identifiant}@example.test` : options.email;
  return prisma.utilisateur.create({
    data: {
      identifiant,
      email,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE_INITIAL),
      role: "membre",
    },
  });
}

/**
 * Jeton émis une minute dans le passé. Indispensable pour tester la
 * révocation : un jeton émis dans la même seconde que la réinitialisation est
 * volontairement accepté (voir jwt.ts::jetonRevoque), ce qui rendrait le test
 * aléatoire.
 */
function jetonAncien(
  compte: { id: number; uuid: string },
  type?: "refresh",
  secondesAvant = 60,
): string {
  const iat = Math.floor(Date.now() / 1000) - secondesAvant;
  return jwt.sign(
    { utilisateurId: compte.id, utilisateurUuid: compte.uuid, iat, ...(type ? { type } : {}) },
    env.JWT_SECRET,
    { expiresIn: "2h" },
  );
}

const demander = (identifiant: string, ip = nouvelleIp()) =>
  request(app).post(`${API}/mot-de-passe-oublie`).set("X-Forwarded-For", ip).send({ identifiant });

const verifier = (identifiant: string, code: string, ip = nouvelleIp()) =>
  request(app).post(`${API}/verifier-code`).set("X-Forwarded-For", ip).send({ identifiant, code });

const reinitialiser = (jeton: string, nouveauMotDePasse = NOUVEAU_MOT_DE_PASSE) =>
  request(app)
    .post(`${API}/reinitialiser-mot-de-passe`)
    .set("X-Forwarded-For", nouvelleIp())
    .send({ jeton, nouveauMotDePasse });

/** L'émission du code se fait en arrière-plan : on attend le n-ième envoi
 * adressé à ce destinataire, et on renvoie le code qu'il contient. */
async function attendreCode(destinataire: string, rang = 1): Promise<string> {
  let code = "";
  await vi.waitFor(
    () => {
      const envois = vi
        .mocked(envoyerEmailCodeReinitialisation)
        .mock.calls.filter(([donnees]) => donnees.destinataire === destinataire);
      expect(envois.length).toBeGreaterThanOrEqual(rang);
      code = envois[rang - 1]![0].code;
    },
    { timeout: 8000, interval: 50 },
  );
  return code;
}

/** Enchaîne demande et vérification, renvoie le jeton de réinitialisation. */
async function obtenirJeton(compte: { identifiant: string; email: string | null }): Promise<string> {
  await demander(compte.identifiant);
  const code = await attendreCode(compte.email!);
  const res = await verifier(compte.identifiant, code);
  expect(res.status).toBe(200);
  return res.body.jeton as string;
}

describe("génération du code", () => {
  it("tire six caractères de l'alphabet, jamais un caractère ambigu", () => {
    for (let i = 0; i < 2000; i += 1) {
      const code = genererCode();
      expect(code).toHaveLength(LONGUEUR_CODE);
      for (const caractere of code) {
        expect(ALPHABET_CODE).toContain(caractere);
        expect("0OI1l").not.toContain(caractere);
      }
    }
  });

  it("utilise tout l'alphabet", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 3000; i += 1) for (const c of genererCode()) vus.add(c);
    expect(vus.size).toBe(ALPHABET_CODE.length);
  });

  it("normalise la saisie : majuscules, sans espaces ni tirets", () => {
    expect(normaliserCode(" ab3 k7-p ")).toBe("AB3K7P");
  });
});

describe("révocation des jetons", () => {
  const maintenant = new Date("2026-09-11T12:00:00.500Z");
  const seconde = Math.floor(maintenant.getTime() / 1000);

  it("ne révoque rien pour un compte jamais réinitialisé", () => {
    expect(jetonRevoque(seconde - 3600, null)).toBe(false);
  });

  it("révoque un jeton émis avant la réinitialisation", () => {
    expect(jetonRevoque(seconde - 1, maintenant)).toBe(true);
  });

  it("accepte un jeton émis dans la même seconde ou après", () => {
    expect(jetonRevoque(seconde, maintenant)).toBe(false);
    expect(jetonRevoque(seconde + 1, maintenant)).toBe(false);
  });
});

describe("POST /auth/mot-de-passe-oublie", () => {
  itDb("répond exactement pareil, que le compte existe ou non", async () => {
    const compte = await creerCompte();
    const existant = await demander(compte.identifiant);
    const inexistant = await demander(`${RUN_PREFIX}personne-inconnue`);

    expect(existant.status).toBe(200);
    expect(inexistant.status).toBe(existant.status);
    expect(inexistant.body).toEqual(existant.body);
  });

  itDb("envoie un code et n'en stocke que le hash", async () => {
    const compte = await creerCompte();
    await demander(compte.identifiant);
    const code = await attendreCode(compte.email!);

    const lignes = await prisma.passwordResetToken.findMany({ where: { utilisateurId: compte.id } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.codeHash).not.toContain(code);
    expect(await verifierMotDePasse(code, lignes[0]!.codeHash)).toBe(true);
    expect(lignes[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
  });

  itDb("n'envoie rien à un compte sans e-mail, avec la même réponse", async () => {
    const compte = await creerCompte({ email: null });
    const res = await demander(compte.identifiant);

    expect(res.status).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { utilisateurId: compte.id } })).toBe(0);
  });

  itDb("invalide le code précédent à chaque nouvelle demande", async () => {
    const compte = await creerCompte();
    await demander(compte.identifiant);
    const premier = await attendreCode(compte.email!, 1);
    await demander(compte.identifiant);
    const second = await attendreCode(compte.email!, 2);

    expect(await prisma.passwordResetToken.count({ where: { utilisateurId: compte.id } })).toBe(1);
    if (premier !== second) {
      expect((await verifier(compte.identifiant, premier)).status).toBe(400);
    }
    expect((await verifier(compte.identifiant, second)).status).toBe(200);
  });

  itDb("limite à trois demandes par quart d'heure et par IP", async () => {
    const ip = nouvelleIp();
    const statuts: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      statuts.push((await demander(`${RUN_PREFIX}limite`, ip)).status);
    }
    expect(statuts).toEqual([200, 200, 200, 429]);
  });
});

describe("POST /auth/verifier-code", () => {
  itDb("renvoie le même message pour un compte inconnu et un code faux", async () => {
    const compte = await creerCompte();
    await demander(compte.identifiant);
    await attendreCode(compte.email!);

    const codeFaux = await verifier(compte.identifiant, "ZZZZZZ");
    const compteInconnu = await verifier(`${RUN_PREFIX}inconnu`, "ZZZZZZ");

    expect(codeFaux.status).toBe(400);
    expect(compteInconnu.status).toBe(400);
    expect(compteInconnu.body.message).toBe(codeFaux.body.message);
  });

  itDb("invalide le code après cinq essais, même si le sixième est juste", async () => {
    const compte = await creerCompte();
    await demander(compte.identifiant);
    const code = await attendreCode(compte.email!);
    const ip = nouvelleIp();

    for (let i = 0; i < 5; i += 1) {
      expect((await verifier(compte.identifiant, "ZZZZZZ", ip)).status).toBe(400);
    }
    expect((await verifier(compte.identifiant, code, ip)).status).toBe(400);

    const ligne = await prisma.passwordResetToken.findFirst({ where: { utilisateurId: compte.id } });
    expect(ligne!.tentatives).toBe(5);
  });

  itDb("accepte le code saisi en minuscules et avec des espaces", async () => {
    const compte = await creerCompte();
    await demander(compte.identifiant);
    const code = await attendreCode(compte.email!);
    const saisie = `${code.slice(0, 3)} ${code.slice(3)}`.toLowerCase();

    const res = await verifier(compte.identifiant, saisie);
    expect(res.status).toBe(200);
    expect(typeof res.body.jeton).toBe("string");
  });
});

describe("POST /auth/reinitialiser-mot-de-passe", () => {
  itDb("réinitialise, révoque les anciennes sessions, et laisse se reconnecter", async () => {
    const compte = await creerCompte();
    const ancienAcces = jetonAncien(compte);
    const ancienRefresh = jetonAncien(compte, "refresh");

    // Avant réinitialisation, la session ouverte fonctionne.
    const avant = await request(app).get(`${API}/moi`).set("Authorization", `Bearer ${ancienAcces}`);
    expect(avant.status).toBe(200);

    const jeton = await obtenirJeton(compte);
    expect((await reinitialiser(jeton)).status).toBe(200);

    // Les jetons d'avant sont révoqués, accès comme rafraîchissement.
    const acces = await request(app).get(`${API}/moi`).set("Authorization", `Bearer ${ancienAcces}`);
    expect(acces.status).toBe(401);
    const refresh = await request(app).post(`${API}/refresh`).send({ refreshToken: ancienRefresh });
    expect(refresh.status).toBe(401);

    // L'ancien mot de passe ne fonctionne plus, le nouveau si.
    const ancienMdp = await request(app)
      .post(`${API}/connexion`)
      .set("X-Forwarded-For", nouvelleIp())
      .send({ identifiant: compte.identifiant, motDePasse: MOT_DE_PASSE_INITIAL });
    expect(ancienMdp.status).toBe(401);

    const connexion = await request(app)
      .post(`${API}/connexion`)
      .set("X-Forwarded-For", nouvelleIp())
      .send({ identifiant: compte.identifiant, motDePasse: NOUVEAU_MOT_DE_PASSE });
    expect(connexion.status).toBe(200);

    // La nouvelle session, émise après la réinitialisation, fonctionne.
    const apres = await request(app)
      .get(`${API}/moi`)
      .set("Authorization", `Bearer ${connexion.body.token as string}`);
    expect(apres.status).toBe(200);
    // La date de réinitialisation ne fuit pas dans les réponses.
    expect(apres.body.utilisateur).not.toHaveProperty("motDePasseModifieLe");
  });

  itDb("n'accepte chaque jeton qu'une seule fois", async () => {
    const compte = await creerCompte();
    const jeton = await obtenirJeton(compte);

    expect((await reinitialiser(jeton)).status).toBe(200);
    expect((await reinitialiser(jeton, "Troisieme789")).status).toBe(400);

    const ligne = await prisma.passwordResetToken.findFirst({ where: { utilisateurId: compte.id } });
    expect(ligne!.utiliseA).not.toBeNull();
  });

  itDb("refuse un mot de passe trop faible sans consommer le jeton", async () => {
    const compte = await creerCompte();
    const jeton = await obtenirJeton(compte);

    expect((await reinitialiser(jeton, "court")).status).toBe(400);
    expect((await reinitialiser(jeton)).status).toBe(200);
  });

  itDb("refuse le jeton de réinitialisation comme jeton d'accès", async () => {
    const compte = await creerCompte();
    const jeton = await obtenirJeton(compte);

    const res = await request(app).get(`${API}/moi`).set("Authorization", `Bearer ${jeton}`);
    expect(res.status).toBe(401);
  });
});

describe("sessions existantes", () => {
  itDb("un compte jamais réinitialisé garde ses sessions, même anciennes", async () => {
    const compte = await creerCompte();
    const vieuxJeton = jetonAncien(compte, undefined, 3600);

    const res = await request(app).get(`${API}/moi`).set("Authorization", `Bearer ${vieuxJeton}`);
    expect(res.status).toBe(200);
  });
});
