import { spawnSync } from "node:child_process";
import { createECDH } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paireVapidCoherente } from "@/config/env";

/** Paire P-256 fraîche, au format base64url du `.env`. La clé privée est
 * complétée à 32 octets : `getPrivateKey()` peut en rendre moins quand le
 * scalaire commence par un octet nul. */
function genererPaire() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const privee = ecdh.getPrivateKey();
  return {
    publique: ecdh.getPublicKey().toString("base64url"),
    privee: Buffer.concat([Buffer.alloc(32 - privee.length), privee]).toString("base64url"),
  };
}

describe("paireVapidCoherente", () => {
  it("accepte une clé publique dérivée de la clé privée", () => {
    const { publique, privee } = genererPaire();
    expect(paireVapidCoherente(publique, privee)).toBe(true);
  });

  it("refuse une clé publique issue d'une autre paire", () => {
    const { privee } = genererPaire();
    const { publique: autrePublique } = genererPaire();
    expect(paireVapidCoherente(autrePublique, privee)).toBe(false);
  });

  it("refuse, sans lever d'exception, une clé privée hors de la courbe", () => {
    const { publique } = genererPaire();
    const scalaireNul = Buffer.alloc(32).toString("base64url");
    expect(paireVapidCoherente(publique, scalaireNul)).toBe(false);
  });
});

describe("démarrage du serveur", () => {
  // Résolu depuis la racine du backend (répertoire courant de vitest), d'où
  // part aussi l'import `./src/config/env.ts` ci-dessous. Pas d'`import.meta`
  // : le backend compile en CommonJS.
  const cliTsx = createRequire(path.join(process.cwd(), "package.json")).resolve("tsx/cli");

  /** Charge env.ts dans un processus séparé, comme au vrai démarrage : sur
   * une configuration invalide, il appelle `process.exit(1)`, ce qui ne
   * peut pas s'observer depuis le processus de test. `process.env` contient
   * déjà le `.env` chargé par l'import ci-dessus ; les variables passées
   * ici l'emportent (dotenv n'écrase jamais une variable existante). */
  function chargerEnv(vapid: { publique: string; privee: string }) {
    return spawnSync(
      process.execPath,
      [cliTsx, "-e", "import('./src/config/env.ts').then(() => console.log('env chargé'))"],
      {
        env: { ...process.env, VAPID_PUBLIC_KEY: vapid.publique, VAPID_PRIVATE_KEY: vapid.privee },
        encoding: "utf8",
      },
    );
  }

  it("refuse de démarrer quand les deux clés VAPID ne forment pas une paire", () => {
    const { privee } = genererPaire();
    const { publique: autrePublique } = genererPaire();

    const resultat = chargerEnv({ publique: autrePublique, privee });

    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toContain("do not form a valid key pair");
    expect(resultat.stdout).not.toContain("env chargé");
    // Le message nomme les variables, jamais leur valeur.
    expect(resultat.stderr).not.toContain(privee);
  }, 30_000);

  it("démarre normalement avec une paire cohérente", () => {
    const resultat = chargerEnv(genererPaire());

    expect(resultat.stderr).not.toContain("do not form a valid key pair");
    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toContain("env chargé");
  }, 30_000);
});
