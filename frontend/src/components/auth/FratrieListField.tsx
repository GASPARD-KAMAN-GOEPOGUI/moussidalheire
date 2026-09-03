import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonPicker } from "./PersonPicker";
import { ConjointesSuggestions } from "./ConjointesSuggestions";
import { emptyNouvellePersonne, fratrieRefLabel, type ApiPersonneResume, type FratrieRef, type PersonRef } from "./inscription-types";

/**
 * Same add/remove list pattern as `PersonRefListField`, but specific to the
 * fratrie: a "nouveau" sibling shares the père by construction, but a
 * polygamous père can have children from different mères — so each new
 * sibling gets its own optional mère override (défaut : la mère du membre —
 * un demi-frère/une demi-sœur se déclare en la remplaçant ici).
 */
export function FratrieListField({
  items,
  onChange,
  excludeIds = [],
  nomHerite,
  mereMembre,
  pereLabel,
  pereConjointes = [],
}: {
  items: FratrieRef[];
  onChange: (items: FratrieRef[]) => void;
  excludeIds?: number[];
  /** Père's nom de famille, once known — forces/greys the nom field of any
   * new sibling created here. */
  nomHerite?: string;
  /** The registering member's own resolved mère — the implicit default for
   * a new sibling's mère when no override is set. */
  mereMembre: PersonRef | null;
  /** For the ConjointesSuggestions label — the père's display name. */
  pereLabel?: string;
  /** The père's known conjointes (existant père only) — offered as
   * suggestions for each new sibling's mère too, same as for the member's
   * own mère (a demi-frère/demi-sœur's mère is still one of the père's
   * known wives, most of the time). */
  pereConjointes?: ApiPersonneResume[];
}) {
  const idsDejaChoisis = items.filter((i) => i.mode === "existant").map((i) => i.id);

  function set(index: number, ref: FratrieRef | null) {
    if (!ref) return;
    onChange(items.map((item, i) => (i === index ? ref : item)));
  }

  function setMere(index: number, mere: PersonRef | null) {
    onChange(
      items.map((item, i) => (i === index && item.mode === "nouveau" ? { ...item, mere: mere ?? undefined } : item)),
    );
  }

  function retirer(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function ajouter() {
    onChange([...items, { mode: "nouveau", donnees: emptyNouvellePersonne("homme") }]);
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-dashed border-border p-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <PersonPicker
                label="frère ou sœur"
                value={item.mode === "nouveau" && !item.donnees.prenom ? null : item}
                onChange={(ref) => set(i, ref as FratrieRef | null)}
                nomHerite={nomHerite}
                excludeIds={[...excludeIds, ...idsDejaChoisis.filter((id) => id !== (item.mode === "existant" ? item.id : -1))]}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => retirer(i)} aria-label="Retirer">
              <X className="size-4" />
            </Button>
          </div>
          {item.mode === "nouveau" && item.donnees.prenom && (
            <div className="space-y-1.5 pl-1">
              <p className="mb-1 text-xs text-muted-foreground">
                Mère {item.mere ? "de ce frère/cette sœur" : "par défaut, la même que la vôtre"}
              </p>
              <PersonPicker
                label="mère de ce frère/cette sœur"
                value={item.mere ?? mereMembre}
                onChange={(ref) => setMere(i, ref)}
                lockedSexe="femme"
              />
              {pereLabel && (
                <ConjointesSuggestions
                  pereLabel={pereLabel}
                  conjointes={pereConjointes}
                  value={item.mere ?? null}
                  onSelect={(c) => setMere(i, c ? { mode: "existant", ...c } : null)}
                />
              )}
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={ajouter}>
        <Plus className="size-4" />
        Ajouter un frère/une sœur
      </Button>
      {items.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {items
            .filter((i) => i.mode === "nouveau" && i.donnees.prenom)
            .map((i, idx) => (
              <li key={idx}>{fratrieRefLabel(i)} nouvelle fiche à créer</li>
            ))}
        </ul>
      )}
    </div>
  );
}
