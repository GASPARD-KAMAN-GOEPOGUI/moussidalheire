import { randomBytes } from "node:crypto";

/**
 * Alphabet des codes de réinitialisation : majuscules et chiffres, sans les
 * caractères que l'on confond en recopiant un mail à la main — 0/O et 1/I.
 * Le `l` minuscule n'y figure pas non plus, l'alphabet étant tout en
 * majuscules.
 *
 * 24 lettres + 8 chiffres = 32 symboles exactement. Ce n'est pas un hasard :
 * 32 divise 256, donc `octet % 32` tire chaque symbole avec une probabilité
 * strictement égale. Avec un alphabet de taille quelconque, le modulo
 * favoriserait les premiers symboles.
 */
export const ALPHABET_CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const LONGUEUR_CODE = 6;

/**
 * Code à usage unique, tiré par `crypto.randomBytes` — jamais `Math.random`,
 * dont la sortie est prévisible. 32⁶ ≈ 1,07 milliard de combinaisons : avec
 * cinq essais autorisés par code, la probabilité de le deviner est de l'ordre
 * de 5 sur un milliard.
 */
export function genererCode(): string {
  const octets = randomBytes(LONGUEUR_CODE);
  let code = "";
  for (const octet of octets) {
    code += ALPHABET_CODE[octet % ALPHABET_CODE.length];
  }
  return code;
}

/**
 * Met une saisie utilisateur dans la forme du code stocké : majuscules, sans
 * espaces ni tirets (un utilisateur peut recopier « AB3 K7P » ou « ab3-k7p »).
 * La comparaison reste stricte sur les caractères eux-mêmes : un « O » saisi
 * ne devient pas un « 0 », ni l'inverse — aucun des deux n'existe dans
 * l'alphabet.
 */
export function normaliserCode(saisie: string): string {
  return saisie.replace(/[\s-]/g, "").toUpperCase();
}
