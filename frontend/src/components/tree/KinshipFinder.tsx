import { useState } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { fullName } from "@/lib/utils";
import type { Gender, Person } from "@/types";
import type { KinshipResult } from "./kinship";

/** French definite article for a kinship noun — "l'" before a vowel sound,
 * otherwise "le "/"la " agreeing with the noun's own grammatical gender
 * (always B's gender, since every term is rendered for B — see kinship.ts). */
function articleFor(label: string, gender: Gender): string {
  if (/^[aeiouyéèêàâ]/i.test(label)) return "l'";
  return gender === "male" ? "le " : "la ";
}

function PersonSearchList({
  people,
  placeholder,
  onSelect,
}: {
  people: Person[];
  placeholder: string;
  onSelect: (person: Person) => void;
}) {
  return (
    <Command className="rounded-lg border border-border">
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>Personne introuvable.</CommandEmpty>
        {people.slice(0, 80).map((p) => (
          <CommandItem key={p.id} value={fullName(p)} onSelect={() => onSelect(p)}>
            <PersonAvatar person={p} size="xs" />
            <span className="truncate">{fullName(p)}</span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

function PersonSlot({ label, person }: { label: string; person: Person }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
      <PersonAvatar person={person} size="xs" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium text-foreground">{fullName(person)}</p>
      </div>
    </div>
  );
}

interface KinshipFinderProps {
  /** People eligible for comparison — already scoped to the currently
   * displayed family/branch (never village-wide). */
  people: Person[];
  personA: Person | null;
  personB: Person | null;
  onSelectA: (person: Person) => void;
  onSelectB: (person: Person) => void;
  onReset: () => void;
  result: KinshipResult | undefined;
}

/**
 * « Lien de parenté » — choisit deux personnes de cette même famille et
 * affiche le lien qui les unit (voir `kinship.ts`) ; le chemin trouvé est
 * transmis par le parent (`GenealogyTree`) à `TreeEdges`/`TreeNode` sous
 * forme de `highlightedIds`, pour se colorer directement sur l'arbre.
 */
export function KinshipFinder({ people, personA, personB, onSelectA, onSelectB, onReset, result }: KinshipFinderProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !personB) onReset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="pointer-events-auto gap-2 shadow-md"
          aria-label="Lien de parenté"
        >
          <Link2 className="size-4" />
          <span className="hidden sm:inline">Lien de parenté</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <p className="text-xs text-muted-foreground">
          Choisissez deux personnes de cette famille pour voir le lien qui les unit.
        </p>

        {personA ? (
          <PersonSlot label="Première personne" person={personA} />
        ) : (
          <PersonSearchList people={people} placeholder="Nom de la 1ʳᵉ personne…" onSelect={onSelectA} />
        )}

        {personA && personB && <PersonSlot label="Deuxième personne" person={personB} />}
        {personA && !personB && (
          <PersonSearchList
            people={people.filter((p) => p.id !== personA.id)}
            placeholder="Nom de la 2ᵉ personne…"
            onSelect={onSelectB}
          />
        )}

        {personA && personB && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            {result ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {fullName(personB)} est {articleFor(result.label, personB.gender)}
                  <span className="font-semibold text-foreground">{result.label.toLowerCase()}</span> de {fullName(personA)}.
                </p>
                {result.approximate && (
                  <p className="text-[11px] text-muted-foreground">
                    Lien approximatif voir le chemin surligné dans l'arbre.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun lien connu entre ces deux personnes dans cet arbre.
              </p>
            )}
            <Button variant="outline" size="sm" onClick={onReset} className="w-full">
              <X className="size-3.5" />
              Réinitialiser
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
