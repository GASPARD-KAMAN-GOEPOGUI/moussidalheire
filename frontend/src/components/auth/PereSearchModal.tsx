import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { initiales, personRefLabel, type ApiPersonneResume, type PersonRef } from "./inscription-types";

interface PersonnesResponse {
  success: true;
  personnes: ApiPersonneResume[];
}

const TAILLE_LISTE_DEFAUT = 10;

/**
 * Recherche du père en plein écran (modale), avec une liste par défaut des
 * derniers hommes enregistrés — distincte de `PersonPicker` (menu déroulant
 * compact, utilisé pour la mère et ailleurs) : cette étape a des besoins
 * propres à elle seule (avatar par candidat, pré-chargement d'un lot de
 * candidats avant même toute recherche).
 */
export function PereSearchModal({
  value,
  onChange,
  onHasCandidates,
}: {
  value: PersonRef | null;
  onChange: (ref: PersonRef | null) => void;
  /** Notifie le parent si la dernière recherche tapée (2+ caractères) a
   * trouvé au moins un candidat — indépendant de la liste par défaut, qui
   * n'est pas le résultat d'une recherche de l'utilisateur. */
  onHasCandidates?: (hasCandidates: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [defaut, setDefaut] = useState<ApiPersonneResume[]>([]);
  const [resultats, setResultats] = useState<ApiPersonneResume[]>([]);
  const [loading, setLoading] = useState(false);

  const recherche = query.trim().length >= 2;
  const liste = recherche ? resultats : defaut;

  // Liste par défaut — les derniers hommes ajoutés au registre — chargée à
  // chaque ouverture, avant toute saisie.
  useEffect(() => {
    if (!open) return;
    apiRequest<PersonnesResponse>(`/personnes?pageSize=${TAILLE_LISTE_DEFAUT * 2}`)
      .then((res) => setDefaut(res.personnes.filter((p) => p.sexe === "homme").slice(0, TAILLE_LISTE_DEFAUT)))
      .catch(() => setDefaut([]));
  }, [open]);

  useEffect(() => {
    if (!recherche) {
      setResultats([]);
      onHasCandidates?.(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      apiRequest<PersonnesResponse>(`/personnes?recherche=${encodeURIComponent(query.trim())}&pageSize=10`)
        .then((res) => {
          const filtres = res.personnes.filter((p) => p.sexe === "homme");
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
  }, [query]);

  function selectionner(p: ApiPersonneResume) {
    onChange({ mode: "existant", ...p });
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="h-10 w-full justify-between font-normal"
        onClick={() => setOpen(true)}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value ? personRefLabel(value) : "Rechercher le père…"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <DialogContent className="max-w-lg overflow-hidden p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Rechercher votre père</DialogTitle>
            <DialogDescription>Recherchez-le par son nom, ou choisissez-le dans la liste ci-dessous.</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput placeholder="Tapez un nom (2 caractères min.)…" value={query} onValueChange={setQuery} />
            {/* max-h-96 (hérité de CommandList) ≈ 7 lignes visibles avant défilement. */}
            <CommandList>
              {recherche && !loading && resultats.length === 0 && (
                <CommandEmpty>Personne introuvable.</CommandEmpty>
              )}
              <CommandGroup heading={recherche ? "Résultats" : "Derniers ajouts au registre"}>
                {liste.map((p) => (
                  <CommandItem key={p.id} value={String(p.id)} onSelect={() => selectionner(p)}>
                    <Avatar className="size-8">
                      {p.photo && <AvatarImage src={p.photo} alt="" />}
                      <AvatarFallback className="text-xs">{initiales(p.prenom, p.nom)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">
                      {p.prenom} {p.nom}
                    </span>
                    {p.matricule && <span className="shrink-0 text-xs text-muted-foreground">{p.matricule}</span>}
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value?.mode === "existant" && value.id === p.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
