/**
 * Turns a backend `VALIDATION_ERROR`'s `details` (the raw Zod issues array —
 * English, developer-facing text like "Invalid input: expected string,
 * received undefined") into a human, French, per-field indication — WITHOUT
 * ever surfacing the backend's own issue text. Only the field *name* (Zod's
 * `path`) is trusted; the message shown is always one of ours.
 *
 * Used by every form's catch block so a validation failure points at what's
 * actually wrong (dynamically, per submission) instead of always showing the
 * same static "Certaines informations saisies ne sont pas valides." banner.
 */
import { ApiError } from "./api-client";

/** Generic, human label for a backend field name — shared across every form
 * in the app (personnes, familles, actualités, lieux, résidences, unions,
 * branches, catégories). Deliberately generic ("prénom", not "le prénom de
 * la personne principale") — a caller that knows a more specific phrasing
 * for its own context is free to override it. */
const CHAMP_LABELS: Record<string, string> = {
  prenom: "prénom",
  nom: "nom",
  surnom: "surnom",
  photo: "photo",
  dateNaissance: "date de naissance",
  lieuNaissance: "lieu de naissance",
  estDecede: "statut (vivant·e ou décédé·e)",
  profession: "profession",
  niveauEtudes: "niveau d'études",
  bio: "biographie",
  estAuVillage: "situation géographique",
  estEnGuinee: "situation géographique",
  telephone: "numéro de téléphone",
  email: "adresse e-mail",
  whatsapp: "numéro WhatsApp",
  sexe: "sexe",
  brancheId: "branche",
  familleId: "famille",
  familleParenteId: "famille parente",
  pereId: "père",
  mereId: "mère",
  matricule: "matricule",
  personneId: "personne",
  epouxId: "époux",
  epouseId: "épouse",
  lieuId: "lieu",
  anneeDebut: "année de début",
  anneeFin: "année de fin",
  estActuelle: "résidence actuelle",
  dateDebut: "date de début",
  dateFin: "date de fin",
  pays: "pays",
  region: "région",
  ville: "ville",
  quartier: "quartier",
  latitude: "latitude",
  longitude: "longitude",
  estVillage: "lieu au village",
  slug: "identifiant (slug)",
  description: "description",
  statut: "statut",
  histoire: "histoire",
  devise: "devise",
  imageCouverture: "image de couverture",
  ancetreId: "ancêtre",
  titre: "titre",
  categorieId: "catégorie",
  resume: "résumé",
  contenu: "contenu",
  auteur: "auteur",
  miseEnAvant: "mise en avant",
  motDePasse: "mot de passe",
  nouveauMotDePasse: "nouveau mot de passe",
  identifiant: "identifiant",
  forcerCreation: "confirmation de création malgré le doublon",
};

export interface ChampInvalide {
  /** The backend's Zod field path, first segment only (e.g. "prenom", never "prenom.0.nom"). */
  field: string;
  /** Always human and French — never the backend's own Zod issue text. */
  message: string;
}

/** Distinct, ordered field names flagged by a `VALIDATION_ERROR` — `[]` for
 * anything else (network error, a non-validation `ApiError` whose own
 * `message` is already the right thing to show, ...). */
export function champsInvalides(err: unknown): ChampInvalide[] {
  if (!(err instanceof ApiError) || err.code !== "VALIDATION_ERROR" || !Array.isArray(err.details)) {
    return [];
  }
  const champs: string[] = [];
  for (const issue of err.details as { path?: unknown }[]) {
    const path = typeof issue?.path === "string" ? issue.path : undefined;
    const premier = path?.split(".")[0];
    if (premier && !champs.includes(premier)) champs.push(premier);
  }
  return champs.map((field) => ({
    field,
    message: `Merci de vérifier le champ « ${CHAMP_LABELS[field] ?? field} ».`,
  }));
}

/** One combined, human sentence naming every invalid field — for forms with
 * a single error banner (no per-field state to populate individually).
 * `undefined` when `err` isn't a field-level validation error, so the
 * caller's own existing fallback (e.g. `err.message`) still applies. */
export function messageChampsInvalides(err: unknown): string | undefined {
  const champs = champsInvalides(err);
  if (champs.length === 0) return undefined;
  const noms = champs.map((c) => `« ${CHAMP_LABELS[c.field] ?? c.field} »`);
  return champs.length === 1
    ? `Merci de vérifier le champ ${noms[0]}.`
    : `Merci de vérifier les champs suivants : ${noms.join(", ")}.`;
}
