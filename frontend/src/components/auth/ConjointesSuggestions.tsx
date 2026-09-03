import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initiales, type ApiPersonneResume, type PersonRef } from "./inscription-types";

/**
 * Chips row for the père's known conjointes. Shared between the member's own
 * mère field (NewMemberDialog) and each new sibling's mère override
 * (FratrieListField) so both read identically. Selection is a toggle:
 * clicking the already-selected chip deselects it (`onSelect(null)`).
 */
export function ConjointesSuggestions({
  pereLabel,
  conjointes,
  value,
  onSelect,
}: {
  pereLabel: string;
  conjointes: ApiPersonneResume[];
  value: PersonRef | null;
  onSelect: (conjointe: ApiPersonneResume | null) => void;
}) {
  if (conjointes.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {conjointes.length === 1 ? "Épouse connue" : "Épouses connues"} de {pereLabel} suggestion pour la mère
        biologique :
      </p>
      <div className="flex flex-wrap gap-1.5">
        {conjointes.map((c) => {
          const selectionnee = value?.mode === "existant" && value.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(selectionnee ? null : c)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors",
                selectionnee
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              <Avatar className="size-5">
                {c.photo && <AvatarImage src={c.photo} alt="" />}
                <AvatarFallback className="text-[10px]">{initiales(c.prenom, c.nom)}</AvatarFallback>
              </Avatar>
              {c.prenom} {c.nom}
            </button>
          );
        })}
      </div>
    </div>
  );
}
