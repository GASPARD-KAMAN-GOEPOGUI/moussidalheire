/**
 * Règles de mot de passe, recopiées à l'identique de `motDePasseSchema` côté
 * backend (backend/src/schemas/utilisateurs/utilisateur.primitives.ts) : 8 à
 * 72 caractères, au moins une lettre, au moins un chiffre.
 *
 * Elles doivent rester STRICTEMENT alignées. Si l'interface jugeait valable un
 * mot de passe que le serveur refuse, l'utilisateur verrait un indicateur au
 * vert et une erreur à l'envoi, sans comprendre pourquoi.
 *
 * D'où `[a-zA-Z]` et non une classe Unicode : le backend ne compte pas les
 * lettres accentuées, « étéàû1234 » n'y contient aucune lettre.
 */
export const LONGUEUR_MIN = 8;
export const LONGUEUR_MAX = 72;

export interface ReglesMotDePasse {
  longueur: boolean;
  lettre: boolean;
  chiffre: boolean;
}

export function verifierRegles(motDePasse: string): ReglesMotDePasse {
  return {
    longueur: motDePasse.length >= LONGUEUR_MIN && motDePasse.length <= LONGUEUR_MAX,
    lettre: /[a-zA-Z]/.test(motDePasse),
    chiffre: /[0-9]/.test(motDePasse),
  };
}

export function respecteLaPolitique(motDePasse: string): boolean {
  const regles = verifierRegles(motDePasse);
  return regles.longueur && regles.lettre && regles.chiffre;
}

/** 0 = vide, 1 = trop faible … 4 = fort. */
export type NiveauForce = 0 | 1 | 2 | 3 | 4;

/**
 * Indication de robustesse, au-delà du minimum exigé. Plafonnée à 1 tant que
 * la politique n'est pas respectée : un indicateur ne doit jamais afficher
 * « Fort » pour un mot de passe que le serveur refusera.
 */
export function evaluerForce(motDePasse: string): NiveauForce {
  if (!motDePasse) return 0;
  if (!respecteLaPolitique(motDePasse)) return 1;

  let points = 0;
  if (motDePasse.length >= 12) points += 1;
  if (/[a-z]/.test(motDePasse) && /[A-Z]/.test(motDePasse)) points += 1;
  if (/[^a-zA-Z0-9]/.test(motDePasse)) points += 1;

  // Politique respectée : au moins « Moyen », jusqu'à « Fort ».
  return points >= 2 ? 4 : points === 1 ? 3 : 2;
}
