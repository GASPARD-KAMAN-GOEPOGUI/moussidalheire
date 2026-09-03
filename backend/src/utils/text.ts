/**
 * Uppercase, accent-stripped form of `valeur` — e.g. "Goépogui"/"goepogui"
 * both become "GOEPOGUI". Used to normalize `Famille.nom` at write time (and
 * search queries against it), so two operators typing the same name with
 * different casing/accents never create two distinct rows for the same
 * lineage. NFD splits accented letters into base+diacritic; the diacritic
 * marks (U+0300-U+036F) are then stripped.
 */
export function versMajusculesSansAccent(valeur: string): string {
  return valeur.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}
