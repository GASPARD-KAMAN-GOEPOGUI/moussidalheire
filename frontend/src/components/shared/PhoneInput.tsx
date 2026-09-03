import * as React from "react";
import { Input } from "@/components/ui/input";
import { nettoyerSaisieTelephone } from "@/lib/utils";

type PhoneInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Le seul champ de saisie d'un numéro de téléphone de l'application — utilisé
 * partout où une personne renseigne le sien (inscription, ajout de membre, de
 * conjoint·e, fiche personne), pour que la règle ne soit écrite qu'une fois.
 *
 * Ne laisse entrer que des chiffres, précédés d'un « + » facultatif : lettres,
 * espaces, tirets, points et parenthèses sont écartés au moment même de la
 * frappe (et du collage, qui déclenche le même événement) plutôt que refusés
 * après coup. Le numéro retenu part en base exactement tel qu'il a été saisi —
 * ce composant filtre, il ne reformate jamais.
 *
 * Écrit la valeur nettoyée directement dans le DOM avant de la remonter : sans
 * cela, une frappe entièrement rejetée (une lettre) ne changerait pas l'état
 * React, donc ne provoquerait aucun rendu, et le caractère refusé resterait
 * affiché. Le curseur est repositionné dans la foulée sur le même nombre de
 * caractères conservés, sinon corriger un chiffre au milieu d'un numéro
 * renverrait le curseur à la fin à chaque touche.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const champ = e.currentTarget;
      const brut = champ.value;
      const position = champ.selectionStart ?? brut.length;
      const nettoye = nettoyerSaisieTelephone(brut);
      const curseur = nettoyerSaisieTelephone(brut.slice(0, position)).length;

      champ.value = nettoye;
      champ.setSelectionRange(curseur, curseur);
      onValueChange(nettoye);
    }

    return (
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        {...props}
        ref={ref}
        value={value}
        onChange={handleChange}
      />
    );
  },
);
PhoneInput.displayName = "PhoneInput";
