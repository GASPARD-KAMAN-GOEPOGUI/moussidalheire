import fs from "node:fs";
import path from "node:path";

/**
 * Racine de `backend/template/emails/` — résolue depuis le répertoire de
 * travail du process (comme `PHOTOS_DIR` dans upload.middleware.ts), pas
 * `__dirname` : `template/` vit à côté de `src/`/`dist/`, jamais copié dans
 * `dist/` par le build (aucun `.ts` à compiler), donc identique en dev
 * (`tsx watch src/server.ts`) et en production (`node dist/server.js`) tant
 * que le process démarre depuis `backend/`.
 */
const TEMPLATES_DIR = path.join(process.cwd(), "template", "emails");

function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type DonneesTemplate = Record<string, string>;

/**
 * Moteur de templates volontairement minimal (aucune dépendance ajoutée) :
 * charge un fichier HTML sous `template/emails/` et remplace ses variables.
 *
 * - `{{cle}}` — la valeur est échappée HTML avant insertion. À utiliser pour
 *   TOUTE donnée pouvant provenir, même indirectement, d'un·e utilisateur·rice
 *   (prénom, nom, identifiant...) — voir `template/README.md`.
 * - `{{{cle}}}` — la valeur est insérée telle quelle, sans échappement.
 *   Réservé aux blocs HTML déjà composés par ce module lui-même (le résultat
 *   d'un appel précédent à `rendre()`, jamais une entrée utilisateur directe)
 *   — c'est ce qui permet à un layout d'accueillir le contenu d'un template
 *   enfant déjà rendu.
 *
 * Une clé absente de `donnees` devient une chaîne vide plutôt que de lever
 * une erreur : un même template reste utilisable même quand un appelant n'a
 * pas besoin de toutes ses variables optionnelles.
 */
export function rendre(cheminRelatif: string, donnees: DonneesTemplate): string {
  const cheminAbsolu = path.join(TEMPLATES_DIR, cheminRelatif);
  const source = fs.readFileSync(cheminAbsolu, "utf-8");
  return source.replace(
    /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g,
    (_correspondance, cleBrute: string | undefined, cleEchappee: string | undefined) => {
      const cle = cleBrute ?? cleEchappee!;
      const valeur = donnees[cle] ?? "";
      return cleBrute !== undefined ? valeur : echapperHtml(valeur);
    },
  );
}
