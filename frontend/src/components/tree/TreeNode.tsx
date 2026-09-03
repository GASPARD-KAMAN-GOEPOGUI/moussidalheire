import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { cn, fullName } from "@/lib/utils";
import type { Person } from "@/types";
import type { LaidOutNode } from "./treeLayout";
import { CARD_WIDTH } from "./treeLayout";

interface TreeNodeProps {
  node: LaidOutNode;
  /** Quand fourni, chaque carte (personne principale et chaque conjoint·e)
   * se surligne ou s'estompe individuellement selon sa propre présence dans
   * l'ensemble — jamais tout le nœud en bloc, pour qu'un chemin qui ne
   * traverse qu'un seul membre d'un couple ne surligne pas l'autre. */
  highlightedIds?: Set<string>;
  onSelect: (person: Person) => void;
  onToggleCollapse: (personId: string) => void;
}

function MiniCard({
  person,
  primary,
  highlighted,
  dimmed,
  onSelect,
}: {
  person: Person;
  primary?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onSelect: (person: Person) => void;
}) {
  const currentResidence = person.residenceHistory.find((r) => r.current);

  return (
    <div
      style={{ width: CARD_WIDTH }}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-xl border bg-card px-2 py-2.5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        primary ? "border-border" : "border-border/70 opacity-90",
        highlighted && "ring-2 ring-primary border-primary shadow-md",
        dimmed && "opacity-35 grayscale",
      )}
    >
      <button type="button" onClick={() => onSelect(person)} className="flex w-full flex-col items-center gap-1">
        <PersonAvatar person={person} size="sm" ring />
        <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-foreground group-hover:text-primary">
          {fullName(person)}
        </p>
        {currentResidence && (
          <p className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <MapPin className="size-2.5 shrink-0" />
            <span className="truncate">{currentResidence.location.city}</span>
          </p>
        )}
        {person.isDeceased && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">†</span>
        )}
      </button>
    </div>
  );
}

export function TreeNode({ node, highlightedIds, onSelect, onToggleCollapse }: TreeNodeProps) {
  const { person, spouses } = node.data;
  const isOn = (id: string) => highlightedIds?.has(id);
  const dimmedFor = (id: string) => (highlightedIds ? !highlightedIds.has(id) : false);

  return (
    <div
      className="absolute flex items-start gap-2"
      style={{ left: node.x, top: node.y, transform: "translate(-50%, 0)" }}
    >
      <MiniCard
        person={person}
        primary
        highlighted={isOn(person.id)}
        dimmed={dimmedFor(person.id)}
        onSelect={onSelect}
      />
      {spouses.map((spouse) => (
        <div key={spouse.id} className="flex items-center">
          <span
            className={cn(
              "mx-0.5 mt-8 text-muted-foreground/50",
              highlightedIds && isOn(person.id) && isOn(spouse.id) && "text-primary",
            )}
          >
            ⚭
          </span>
          <MiniCard
            person={spouse}
            highlighted={isOn(spouse.id)}
            dimmed={dimmedFor(spouse.id)}
            onSelect={onSelect}
          />
        </div>
      ))}

      {node.hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(person.id);
          }}
          className="absolute -bottom-3 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
          title={node.collapsed ? "Déplier les descendants" : "Replier les descendants"}
          aria-label={node.collapsed ? `Déplier les descendants de ${person.firstName} ${person.lastName}` : `Replier les descendants de ${person.firstName} ${person.lastName}`}
        >
          {node.collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
