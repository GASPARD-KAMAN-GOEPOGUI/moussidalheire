import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Moon, Newspaper, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationsPrompt } from "@/components/shared/NotificationsPrompt";
import { useTheme } from "@/hooks/useTheme";
import { useDebounce } from "@/hooks/useDebounce";
import { globalSearch, type GlobalSearchResults } from "@/services/api/search";
import { fullName } from "@/lib/utils";
import { PLATFORM_NAME } from "@/data/mock/pools";

const TITLES: Record<string, string> = {
  "/": "Accueil",
  "/dashboard": "Tableau de bord",
  "/habitants": "Habitants",
  "/familles": "Familles",
  "/arbre": "Arbre généalogique",
  "/actualites": "Actualités",
};

const EMPTY_RESULTS: GlobalSearchResults = { people: [], families: [], locations: [], news: [] };

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Recherche globale : menu de suggestions ancré au champ de l'en-tête (pas
  // une page dédiée, pas de modale plein écran) — Popover + Command en
  // `shouldFilter={false}` comme LocationPicker/PereSearchModal/PersonPicker,
  // puisque `results` reflète déjà une recherche serveur ; laisser cmdk
  // refiltrer localement sur des `value` internes (`person-${id}`, ...)
  // masquerait tout, exactement le bug corrigé sur l'ancienne modale ⌘K.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_RESULTS);
  const debounced = useDebounce(query, 200);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults(EMPTY_RESULTS);
      return;
    }
    let cancelled = false;
    globalSearch(debounced).then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    if (!searchOpen) setQuery("");
  }, [searchOpen]);

  function goToResult(path: string) {
    setSearchOpen(false);
    navigate(path);
  }

  const hasResults =
    results.people.length || results.families.length || results.locations.length || results.news.length;

  const title =
    TITLES[location.pathname] ??
    (location.pathname.endsWith("/modifier")
      ? "Modifier l'habitant"
      : location.pathname.startsWith("/habitants")
        ? "Profil habitant"
        : location.pathname.startsWith("/familles")
          ? "Famille"
          : location.pathname.startsWith("/actualites")
            ? "Actualité"
            : PLATFORM_NAME);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:pl-6">
      <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Retour">
        <ArrowLeft aria-hidden="true" />
      </Button>

      <h1 className="hidden font-display text-lg font-semibold text-foreground sm:block">{title}</h1>

      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <button className="ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted sm:max-w-md">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate text-left">Rechercher un habitant, une famille, un lieu…</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Rechercher…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {!query.trim() && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Tapez pour rechercher un habitant, une famille, un lieu ou une actualité.
                </div>
              )}
              {query.trim() && !hasResults && (
                <CommandEmpty>Aucun résultat pour « {query} ».</CommandEmpty>
              )}

              {results.people.length > 0 && (
                <CommandGroup heading="Habitants">
                  {results.people.map((p) => (
                    <CommandItem key={p.id} value={`person-${p.id}`} onSelect={() => goToResult(`/habitants/${p.id}`)}>
                      <PersonAvatar person={p} size="xs" />
                      <span>{fullName(p)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.locations.length > 0 && (
                <CommandGroup heading="Lieux">
                  {results.locations.map((l) => (
                    <CommandItem
                      key={l.id}
                      value={`loc-${l.id}`}
                      onSelect={() => goToResult(`/habitants?location=${encodeURIComponent(l.city)}`)}
                    >
                      <MapPin className="size-4 text-muted-foreground" />
                      <span>
                        {l.city}, {l.country}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.news.length > 0 && (
                <CommandGroup heading="Actualités">
                  {results.news.map((n) => (
                    <CommandItem key={n.id} value={`news-${n.id}`} onSelect={() => goToResult(`/actualites/${n.id}`)}>
                      <Newspaper className="size-4 text-muted-foreground" />
                      <span className="truncate">{n.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <NotificationsPrompt />

      <InstallPrompt />

      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}>
        {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
    </header>
  );
}
