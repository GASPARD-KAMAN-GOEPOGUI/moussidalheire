import type { Location } from "@/types";

// Deterministic PRNG (mulberry32) so mock data is stable across reloads.
export function createRng(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickWeightedInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export const MALE_FIRST_NAMES = [
  "Moussa", "Jean", "Paul", "Étienne", "Pierre", "Nestor", "Zoumana", "Sékou",
  "Théophile", "Emmanuel", "Gaspard", "Fabé", "Landry", "Odilon", "Barnabé",
  "Célestin", "Alphonse", "Norbert", "Faustin", "Léopold", "Anselme", "Camille",
  "Guy", "Martial", "Aboubacar", "Ibrahima", "Daniel", "Simon", "André", "Victor",
] as const;

export const FEMALE_FIRST_NAMES = [
  "Marie", "Hélène", "Thérèse", "Joséphine", "Rachel", "Suzanne", "Odette",
  "Clarisse", "Béatrice", "Henriette", "Solange", "Christine", "Aminata",
  "Fatoumata", "Léontine", "Antoinette", "Colette", "Delphine", "Espérance",
  "Félicité", "Georgette", "Honorine", "Irène", "Judith", "Kadiatou", "Louise",
  "Monique", "Nadège", "Pauline", "Rosalie",
] as const;

export const FAMILY_SURNAMES = [
  "Lamah", "Kolié", "Guilavogui", "Haba", "Kamano", "Zoumanigui",
] as const;

export const NICKNAMES = [
  "Papa Moussa", "Tonton Fabé", "Mama Rachel", "Vieux", "Petit Pierre",
  "Grande Marie", "Doyen", "Tantie Léontine",
] as const;

export const PROFESSIONS = [
  "Agriculteur", "Enseignant", "Infirmière", "Commerçante", "Menuisier",
  "Chauffeur", "Couturière", "Mécanicien", "Fonctionnaire", "Étudiant",
  "Ingénieur", "Médecin", "Avocate", "Électricien", "Maçon", "Pêcheur",
  "Comptable", "Sage-femme", "Chercheur", "Artisan", "Retraité",
  "Entrepreneure", "Journaliste", "Pasteur", "Notable du village",
] as const;

export const EDUCATION_LEVELS = [
  "Non scolarisé", "Primaire", "Collège", "Lycée", "Licence", "Master",
  "Doctorat", "Formation professionnelle",
] as const;

export const MARITAL_STATUS_LABELS: Record<"celibataire" | "marie" | "divorce" | "veuf", string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
};

export const VILLAGE_LOCATION: Location = {
  id: "loc-village",
  country: "Guinée",
  city: "Moussidalheire",
  region: "Nzérékoré",
  district: "Quartier Centre",
  isVillage: true,
  lat: 7.75,
  lng: -8.82,
};

export const LOCATIONS: Location[] = [
  VILLAGE_LOCATION,
  { id: "loc-village-peulh", country: "Guinée", city: "Moussidalheire", region: "Nzérékoré", district: "Quartier Peulh", isVillage: true, lat: 7.752, lng: -8.818 },
  { id: "loc-village-marche", country: "Guinée", city: "Moussidalheire", region: "Nzérékoré", district: "Quartier Marché", isVillage: true, lat: 7.748, lng: -8.823 },
  { id: "loc-nzerekore", country: "Guinée", city: "Nzérékoré", region: "Nzérékoré", lat: 7.756, lng: -8.818 },
  { id: "loc-conakry", country: "Guinée", city: "Conakry", region: "Conakry", lat: 9.6412, lng: -13.5784 },
  { id: "loc-kankan", country: "Guinée", city: "Kankan", region: "Kankan", lat: 10.3854, lng: -9.3057 },
  { id: "loc-kissidougou", country: "Guinée", city: "Kissidougou", region: "Faranah", lat: 9.1855, lng: -10.0999 },
  { id: "loc-macenta", country: "Guinée", city: "Macenta", region: "Nzérékoré", lat: 8.5501, lng: -9.4749 },
  { id: "loc-dakar", country: "Sénégal", city: "Dakar", lat: 14.7167, lng: -17.4677 },
  { id: "loc-abidjan", country: "Côte d'Ivoire", city: "Abidjan", lat: 5.3600, lng: -4.0083 },
  { id: "loc-paris", country: "France", city: "Paris", lat: 48.8566, lng: 2.3522 },
  { id: "loc-marseille", country: "France", city: "Marseille", lat: 43.2965, lng: 5.3698 },
  { id: "loc-newyork", country: "États-Unis", city: "New York", lat: 40.7128, lng: -74.006 },
  { id: "loc-bruxelles", country: "Belgique", city: "Bruxelles", lat: 50.8503, lng: 4.3517 },
];

export const VILLAGE_NAME = VILLAGE_LOCATION.city;
export const PLATFORM_NAME = "Moussidalheire";
