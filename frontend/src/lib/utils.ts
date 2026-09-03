import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

export function formatYearRange(start?: number, end?: number, current?: boolean) {
  if (!start) return "";
  if (current) return `Depuis ${start}`;
  if (!end) return `${start}`;
  return `${start} – ${end}`;
}

export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared across every form that captures a person's contact info, so the two never drift apart. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?\d{6,}$/;

/**
 * Le champ téléphone n'accepte que des chiffres, précédés d'un « + »
 * facultatif — jamais de lettres, d'espaces ni d'aucun autre caractère
 * spécial. Appliqué à chaque frappe ET au collage (voir `PhoneInput`), de
 * sorte qu'un caractère refusé n'apparaisse jamais dans le champ plutôt que
 * d'être signalé après coup. Ce qui reste est stocké tel quel : rien n'est
 * préfixé, complété ni reformaté (le backend applique la même règle dans
 * `personne.validator.ts`, un client ne pouvant pas être cru sur parole).
 */
export function nettoyerSaisieTelephone(valeur: string): string {
  const chiffres = valeur.replace(/\D/g, "");
  return valeur.trimStart().startsWith("+") ? `+${chiffres}` : chiffres;
}

/**
 * Uppercase, accent-stripped form of `valeur` — e.g. "Goépogui"/"goepogui"
 * both become "GOEPOGUI". Mirrors the backend's `versMajusculesSansAccent`
 * (see `backend/src/utils/text.ts`) — applied on every keystroke of a
 * personne's "Nom" field so what's displayed while typing is already exactly
 * what gets stored, never a separate "clean up after the fact" step. NFD
 * splits accented letters into base+diacritic; the diacritic marks
 * (U+0300-U+036F) are then stripped.
 */
export function versMajusculesSansAccent(valeur: string): string {
  return valeur.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}
