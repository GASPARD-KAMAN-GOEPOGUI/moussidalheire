import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { NouvellePersonneFields } from "./NouvellePersonneFields";
import { emptyNouvellePersonne, personRefLabel, type ApiPersonneResume, type PersonRef, type Sexe } from "./inscription-types";

interface PersonnesResponse {
  success: true;
  personnes: ApiPersonneResume[];
}

/**
 * Searchable, network-backed person picker for the self-registration wizard —
 * queries the real `GET /personnes?recherche=...` (public, no auth required,
 * since registration happens before the user has a token). Distinct from
 * `src/components/people/PersonCombobox.tsx`, which filters an in-memory mock
 * array and stays on the admin/mock flows. Also lets the user create a new
 * person on the spot: that data is kept as a draft (`{mode:"nouveau",
 * donnees}`) and never sent to the server until the whole registration is
 * submitted — see NewMemberDialog's single `POST /auth/inscription` call.
 */
export function PersonPicker({
  label,
  value,
  onChange,
  lockedSexe,
  excludeIds = [],
  nomHerite,
  autoriserCreation = true,
  onHasCandidates,
}: {
  label: string;
  value: PersonRef | null;
  onChange: (ref: PersonRef | null) => void;
  lockedSexe?: Sexe;
  excludeIds?: number[];
  /** Forces and disables the nom field on "créer une nouvelle personne" —
   * used for the fratrie once the père's nom de famille is known. */
  nomHerite?: string;
  /** Hides "Créer une nouvelle personne" — used for la mère, qui doit venir
   * d'une recherche parmi les personnes existantes ou des suggestions issues
   * du père, jamais d'une création libre. */
  autoriserCreation?: boolean;
  /** Notifie le parent si une liste de correspondances est actuellement
   * affichée (true) ou non — que ce soit faute d'avoir cherché, ou parce que
   * la recherche n'a rien trouvé. Sert à n'afficher un message de secours
   * (ex. proposer une création) que lorsqu'il n'y a aucune correspondance à
   * choisir, jamais en même temps qu'une liste de résultats. */
  onHasCandidates?: (hasCandidates: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState<ApiPersonneResume[]>([]);
  const [loading, setLoading] = useState(false);
  const [creerOuvert, setCreerOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState(emptyNouvellePersonne(lockedSexe ?? "homme"));

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResultats([]);
      onHasCandidates?.(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      apiRequest<PersonnesResponse>(`/personnes?recherche=${encodeURIComponent(query.trim())}&pageSize=10`)
        .then((res) => {
          const filtres = res.personnes.filter(
            (p) => !excludeIds.includes(p.id) && (!lockedSexe || p.sexe === lockedSexe),
          );
          setResultats(filtres);
          onHasCandidates?.(filtres.length > 0);
        })
        .catch(() => {
          setResultats([]);
          onHasCandidates?.(false);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  function ouvrirCreation() {
    setOpen(false);
    setBrouillon({ ...emptyNouvellePersonne(lockedSexe ?? "homme"), nom: nomHerite ?? "" });
    setCreerOuvert(true);
  }

  function validerCreation() {
    if (!brouillon.prenom.trim() || !brouillon.nom.trim()) return;
    onChange({ mode: "nouveau", donnees: brouillon });
    setCreerOuvert(false);
  }

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="h-10 w-full justify-between font-normal"
              >
                <span className={cn("truncate", !value && "text-muted-foreground")}>
                  {value ? personRefLabel(value) : `Rechercher ${label.toLowerCase()}…`}
                </span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
              <Command shouldFilter={false}>
                <CommandInput placeholder="Tapez un nom (2 caractères min.)…" value={query} onValueChange={setQuery} />
                <CommandList>
                  {!loading && query.trim().length >= 2 && resultats.length === 0 && (
                    <CommandEmpty>Personne introuvable.</CommandEmpty>
                  )}
                  <CommandGroup>
                    {resultats.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={String(p.id)}
                        onSelect={() => {
                          onChange({ mode: "existant", ...p });
                          setOpen(false);
                        }}
                      >
                        <Check className={cn("size-4 shrink-0", value?.mode === "existant" && value.id === p.id ? "opacity-100" : "opacity-0")} />
                        <span className="min-w-0 flex-1 truncate">
                          {p.prenom} {p.nom}
                        </span>
                        {p.matricule && <span className="shrink-0 text-xs text-muted-foreground">{p.matricule}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {value && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label={`Retirer ${label.toLowerCase()}`}>
              <X className="size-4" />
            </Button>
          )}
        </div>
        {autoriserCreation && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={ouvrirCreation}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <UserPlus className="size-3.5" />
            Créer une nouvelle personne
          </Button>
        )}
      </div>

      <Dialog open={creerOuvert} onOpenChange={setCreerOuvert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer : {label}</DialogTitle>
            <DialogDescription>
              Cette fiche sera créée en même temps que votre inscription, avec son propre matricule généré
              automatiquement.
            </DialogDescription>
          </DialogHeader>
          <NouvellePersonneFields
            idPrefix="picker"
            value={brouillon}
            onChange={setBrouillon}
            lockedSexe={lockedSexe}
            nomHerite={nomHerite}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setCreerOuvert(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={validerCreation} disabled={!brouillon.prenom.trim() || !brouillon.nom.trim()}>
              Utiliser cette fiche
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
