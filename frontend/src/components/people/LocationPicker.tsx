import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, MapPin, MapPinPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { searchLieux, creerLieuReel } from "@/services/api/lieux";
import { cn } from "@/lib/utils";
import type { Location } from "@/types";

function locationLabel(l: Location): string {
  return [l.city, l.region, l.country].filter(Boolean).join(", ");
}

/**
 * Searchable, network-backed picker for the `Lieu` référentiel — mirrors
 * `PersonPicker`'s search-or-create pattern, scaled down to the two required
 * fields (`pays`/`ville`). Used for a personne's résidence actuelle: a
 * single value, not a history (see `people.ts::definirResidenceActuelle`).
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: Location | null;
  onChange: (location: Location | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [creerOuvert, setCreerOuvert] = useState(false);
  const [pays, setPays] = useState("Guinée");
  const [ville, setVille] = useState("");
  const [estVillage, setEstVillage] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setResultats([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchLieux(query)
        .then(setResultats)
        .catch(() => setResultats([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  function ouvrirCreation() {
    setOpen(false);
    setPays("Guinée");
    setVille(query.trim());
    setEstVillage(false);
    setCreerOuvert(true);
  }

  async function validerCreation() {
    if (!pays.trim() || !ville.trim()) return;
    setCreating(true);
    try {
      const { location } = await creerLieuReel({ pays: pays.trim(), ville: ville.trim(), estVillage });
      onChange(location);
      setCreerOuvert(false);
    } finally {
      setCreating(false);
    }
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
                <span className={cn("flex min-w-0 items-center gap-2 truncate", !value && "text-muted-foreground")}>
                  <MapPin className="size-4 shrink-0 opacity-50" />
                  <span className="truncate">{value ? locationLabel(value) : "Rechercher un lieu…"}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
              <Command shouldFilter={false}>
                <CommandInput placeholder="Ville ou pays…" value={query} onValueChange={setQuery} />
                <CommandList>
                  {!loading && resultats.length === 0 && (
                    <CommandEmpty>Aucun lieu trouvé.</CommandEmpty>
                  )}
                  <CommandGroup>
                    {resultats.map((l) => (
                      <CommandItem
                        key={l.id}
                        value={l.id}
                        onSelect={() => {
                          onChange(l);
                          setOpen(false);
                        }}
                      >
                        <Check className={cn("size-4 shrink-0", value?.id === l.id ? "opacity-100" : "opacity-0")} />
                        <span className="min-w-0 flex-1 truncate">{locationLabel(l)}</span>
                        {l.isVillage && <span className="shrink-0 text-xs text-muted-foreground">Village</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {value && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Retirer le lieu">
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={ouvrirCreation}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <MapPinPlus className="size-3.5" />
          Ajouter un nouveau lieu
        </Button>
      </div>

      <Dialog open={creerOuvert} onOpenChange={setCreerOuvert}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau lieu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lieu-ville">Ville</Label>
              <Input id="lieu-ville" value={ville} onChange={(e) => setVille(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lieu-pays">Pays</Label>
              <Input id="lieu-pays" value={pays} onChange={(e) => setPays(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="lieu-village" checked={estVillage} onCheckedChange={(c) => setEstVillage(c === true)} />
              <Label htmlFor="lieu-village" className="font-normal">
                C'est le village de Moussidalheire
              </Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCreerOuvert(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void validerCreation()}
              disabled={creating || !pays.trim() || !ville.trim()}
            >
              {creating ? "Création…" : "Utiliser ce lieu"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
