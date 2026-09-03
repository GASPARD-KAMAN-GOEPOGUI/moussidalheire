import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonPicker } from "./PersonPicker";
import { emptyNouvellePersonne, personRefLabel, type PersonRef, type Sexe } from "./inscription-types";

/** N `PersonPicker`s + add/remove — used for both fratrie and conjoints in the
 * self-registration wizard. Each picker excludes the ids already picked in
 * the list (and the member/parents themselves, via `excludeIds`) so the same
 * person can't be added twice. */
export function PersonRefListField({
  label,
  addLabel,
  items,
  onChange,
  excludeIds = [],
  lockedSexe,
  max,
}: {
  label: string;
  addLabel: string;
  items: PersonRef[];
  onChange: (items: PersonRef[]) => void;
  excludeIds?: number[];
  lockedSexe?: Sexe;
  max?: number;
}) {
  const idsDejaChoisis = items.filter((i) => i.mode === "existant").map((i) => i.id);

  function set(index: number, ref: PersonRef | null) {
    if (!ref) return;
    onChange(items.map((item, i) => (i === index ? ref : item)));
  }

  function retirer(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function ajouter() {
    onChange([...items, { mode: "nouveau", donnees: emptyNouvellePersonne(lockedSexe ?? "homme") }]);
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <PersonPicker
              label={label}
              value={item.mode === "nouveau" && !item.donnees.prenom ? null : item}
              onChange={(ref) => set(i, ref)}
              lockedSexe={lockedSexe}
              excludeIds={[...excludeIds, ...idsDejaChoisis.filter((id) => id !== (item.mode === "existant" ? item.id : -1))]}
            />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => retirer(i)} aria-label="Retirer">
            <X className="size-4" />
          </Button>
        </div>
      ))}
      {(max === undefined || items.length < max) && (
        <Button type="button" variant="outline" size="sm" onClick={ajouter}>
          <Plus className="size-4" />
          {addLabel}
        </Button>
      )}
      {items.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {items
            .filter((i) => i.mode === "nouveau" && i.donnees.prenom)
            .map((i, idx) => (
              <li key={idx}>{personRefLabel(i)} nouvelle fiche à créer</li>
            ))}
        </ul>
      )}
    </div>
  );
}
