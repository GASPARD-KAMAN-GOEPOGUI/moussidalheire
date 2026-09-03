import bcrypt from "bcrypt";
import { randomInt } from "node:crypto";

/**
 * Cost factor for bcrypt's key-derivation. 12 is a widely-used baseline that stays
 * well under ~250ms on modern hardware while remaining expensive to brute-force.
 */
const SALT_ROUNDS = 12;

/** Never store a plaintext password — always pass it through this before persisting. */
export async function hacherMotDePasse(motDePasseClair: string): Promise<string> {
  return bcrypt.hash(motDePasseClair, SALT_ROUNDS);
}

export async function verifierMotDePasse(motDePasseClair: string, hash: string): Promise<boolean> {
  return bcrypt.compare(motDePasseClair, hash);
}

const SUFFIXE_LONGUEUR = 4;

/**
 * The initial password assigned when an account is created (self-registration
 * or a personne created on the fly — père/mère/fratrie/conjoint/enfant) —
 * never chosen by the client. Format: the personne's own `nom` (already
 * normalized to uppercase/no-accent by the validator — see
 * `versMajusculesSansAccent`) followed by 4 random digits from
 * `crypto.randomInt` (cryptographically strong, unlike `Math.random`), e.g.
 * "GOEPOGUI4821" — readable/memorable for a one-time credential sent once by
 * email, while the random suffix keeps two accounts created with the same nom
 * (e.g. père et mère créés ensemble) from sharing a password. Always meant to
 * be superseded immediately by whatever the user sets through
 * `POST /auth/mot-de-passe` on first login.
 */
export function genererMotDePasseAleatoire(nom: string): string {
  let suffixe = "";
  for (let i = 0; i < SUFFIXE_LONGUEUR; i++) {
    suffixe += randomInt(10);
  }
  return `${nom.replace(/\s+/g, "")}${suffixe}`;
}
