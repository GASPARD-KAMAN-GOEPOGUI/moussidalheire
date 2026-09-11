import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LONGUEUR_MIN, evaluerForce, verifierRegles } from "@/lib/mot-de-passe";

const LIBELLES = ["", "Trop faible", "Moyen", "Bon", "Fort"] as const;
const COULEURS = ["", "bg-destructive", "bg-amber-500", "bg-lime-600", "bg-emerald-600"] as const;

/**
 * Indicateur de force + liste des règles exigées par le serveur.
 *
 * La barre n'est qu'une indication ; ce qui compte, ce sont les trois règles
 * cochées en dessous — les seules que le backend vérifie.
 */
export function ForceMotDePasse({ motDePasse }: { motDePasse: string }) {
  const niveau = evaluerForce(motDePasse);
  const regles = verifierRegles(motDePasse);

  const liste = [
    { ok: regles.longueur, texte: `${LONGUEUR_MIN} caractères minimum` },
    { ok: regles.lettre, texte: "Au moins une lettre (sans accent)" },
    { ok: regles.chiffre, texte: "Au moins un chiffre" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                niveau >= segment ? COULEURS[niveau] : "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="w-20 text-right text-xs font-medium text-muted-foreground" aria-live="polite">
          {LIBELLES[niveau]}
        </span>
      </div>

      <ul className="space-y-1">
        {liste.map(({ ok, texte }) => (
          <li
            key={texte}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              ok ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground",
            )}
          >
            {ok ? <Check className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
            <span>{texte}</span>
            <span className="sr-only">{ok ? "(respecté)" : "(non respecté)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
