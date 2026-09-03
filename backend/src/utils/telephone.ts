/** Indicatif de la Guinée, seul indicatif que cette application ait à
 * reconnaître : tous les numéros saisis sont locaux, un membre écrivant son
 * numéro tantôt avec, tantôt sans. */
const INDICATIF_GUINEE = "224";

/** En dessous, retirer un « 224 » de tête ferait passer un vrai numéro pour
 * un fragment — aucun numéro local n'est aussi court. */
const LONGUEUR_MINIMALE_SANS_INDICATIF = 8;

/**
 * Réduit un numéro à ce qui l'identifie vraiment : ses chiffres, débarrassés
 * de toute ponctuation et de l'indicatif guinéen sous ses trois écritures
 * (`+224`, `00224`, `224`). `620000000`, `+224620000000`, `00224 620 00 00 00`
 * et `+224-620-00-00-00` donnent donc tous `620000000`.
 *
 * Sert uniquement à *reconnaître* un numéro à la connexion, jamais à le
 * réécrire : un numéro est stocké exactement tel que la personne l'a saisi
 * (voir `telephoneSchema` dans `validators/personne.validator.ts`). C'est
 * précisément parce que la base contient des formes hétérogènes — les fiches
 * antérieures à la règle de saisie portent encore espaces et tirets — que la
 * comparaison doit se faire sur cette forme réduite, sinon un membre ne
 * s'authentifierait qu'en retrouvant au caractère près la façon dont son
 * numéro a été enregistré.
 *
 * L'indicatif n'est retiré que s'il reste ensuite un numéro plausible : un
 * numéro qui commencerait par 224 sans que ce soit un indicatif reste intact.
 */
export function chiffresSignificatifs(valeur: string): string {
  const chiffres = valeur.replace(/\D/g, "");
  const sansPrefixeInternational = chiffres.startsWith("00") ? chiffres.slice(2) : chiffres;
  if (!sansPrefixeInternational.startsWith(INDICATIF_GUINEE)) return sansPrefixeInternational;

  const sansIndicatif = sansPrefixeInternational.slice(INDICATIF_GUINEE.length);
  return sansIndicatif.length >= LONGUEUR_MINIMALE_SANS_INDICATIF
    ? sansIndicatif
    : sansPrefixeInternational;
}

/** Deux écritures du même numéro. Un numéro vide n'est jamais « le même »
 * que quoi que ce soit — sans quoi une fiche sans téléphone deviendrait
 * l'égale de n'importe quelle saisie sans chiffre. */
export function memeNumero(a: string, b: string): boolean {
  const gauche = chiffresSignificatifs(a);
  return gauche.length > 0 && gauche === chiffresSignificatifs(b);
}
