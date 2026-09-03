import { useState } from "react";
import { HelpCircle, Maximize, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { fullName } from "@/lib/utils";
import type { Person } from "@/types";
import { KinshipFinder } from "./KinshipFinder";
import type { KinshipResult } from "./kinship";

interface TreeControlsProps {
  people: Person[];
  onZoomIn: () => void;
  onZoomOut: () => void;
  onJumpToPerson: (person: Person) => void;
  /** Omitted for the canvas already rendered inside the fullscreen modal —
   * no point offering "plein écran" again from in there. */
  onMaximize?: () => void;
  /** Used by the small per-person preview cards on "Tout le village" — no
   * help legend, no zoom buttons (the card itself is a static preview, not
   * meant to be panned/zoomed in place); only "plein écran" remains, to open
   * the fully interactive tree. */
  compact?: boolean;
  /** « Lien de parenté » — deux personnes de cette même famille + le lien
   * calculé entre elles, portés par `GenealogyTree` (voir kinship.ts). */
  kinshipPersonA: Person | null;
  kinshipPersonB: Person | null;
  onSelectKinshipA: (person: Person) => void;
  onSelectKinshipB: (person: Person) => void;
  onResetKinship: () => void;
  kinshipResult: KinshipResult | undefined;
}

export function TreeControls({
  people,
  onZoomIn,
  onZoomOut,
  onJumpToPerson,
  onMaximize,
  compact,
  kinshipPersonA,
  kinshipPersonB,
  onSelectKinshipA,
  onSelectKinshipB,
  onResetKinship,
  kinshipResult,
}: TreeControlsProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-2 p-3">
      {!compact && (
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="pointer-events-auto gap-2 shadow-md"
              aria-label="Trouver une personne"
            >
              <Search className="size-4" />
              <span className="hidden sm:inline">Trouver une personne</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Nom d'un membre de cette famille…" />
              <CommandList>
                <CommandEmpty>Personne introuvable.</CommandEmpty>
                {people.slice(0, 80).map((p) => (
                  <CommandItem
                    key={p.id}
                    value={fullName(p)}
                    onSelect={() => {
                      onJumpToPerson(p);
                      setSearchOpen(false);
                    }}
                  >
                    <PersonAvatar person={p} size="xs" />
                    <span className="truncate">{fullName(p)}</span>
                    <span className="ml-auto text-xs text-muted-foreground">Gén. {p.generation}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {!compact && (
        <KinshipFinder
          people={people}
          personA={kinshipPersonA}
          personB={kinshipPersonB}
          onSelectA={onSelectKinshipA}
          onSelectB={onSelectKinshipB}
          onReset={onResetKinship}
          result={kinshipResult}
        />
      )}

      <div className="pointer-events-auto ml-auto flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur">
        {!compact && (
          <>
            <Popover open={legendOpen} onOpenChange={setLegendOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Comment lire l'arbre">
                  <HelpCircle />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-2 text-sm">
                <p className="font-display font-semibold text-foreground">Comment lire l'arbre</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li>⚭ relie deux personnes unies par le mariage.</li>
                  <li>Les traits verticaux relient parents et enfants.</li>
                  <li>Cliquez sur une carte pour l'aperçu rapide.</li>
                  <li>Le bouton ⌃ / ⌄ replie ou déplie une branche.</li>
                  <li>Les photos en niveaux de gris signalent une personne décédée.</li>
                </ul>
              </PopoverContent>
            </Popover>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="icon-sm" onClick={onZoomOut} title="Zoom arrière" aria-label="Zoom arrière">
              <Minus />
            </Button>
          </>
        )}
        {onMaximize && (
          <Button variant="ghost" size="icon-sm" onClick={onMaximize} title="Plein écran" aria-label="Afficher l'arbre en plein écran">
            <Maximize />
          </Button>
        )}
        {!compact && (
          <Button variant="ghost" size="icon-sm" onClick={onZoomIn} title="Zoom avant" aria-label="Zoom avant">
            <Plus />
          </Button>
        )}
      </div>
    </div>
  );
}
