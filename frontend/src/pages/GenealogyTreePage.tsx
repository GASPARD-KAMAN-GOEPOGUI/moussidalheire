import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GitFork, Search, Smartphone, User, Users, X } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { GenealogyTree } from "@/components/tree/GenealogyTree";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { useAsync } from "@/hooks/useAsync";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuthStore } from "@/store/useAuthStore";
import {
  buildIndividualTree,
  buildPersonalTree,
  buildVillageTrees,
  collectTreePeople,
  fetchVillageIndex,
  type FamilyTreeNode,
  type VillageTreeEntry,
} from "@/services/api/tree";
import { fullName } from "@/lib/utils";
import type { Person } from "@/types";

type ViewMode = "village" | "moi" | "person";

const VILLAGE_BATCH_SIZE = 12;

/** One family cluster's individual tree, rendered with the existing pan/zoom
 * canvas — reused as-is (search, quick view, add-relation menu) for every
 * card in the "Tout le village" collection, exactly like the single focused
 * tree used by "Moi"/"Rechercher". "Tout le village" itself deduplicates
 * which person becomes a card's subject (see `buildVillageTrees` — a père,
 * une mère et leur enfant collapse into one card, not three); this component
 * only ever renders whatever single tree it's handed. */
function IndividualTreeCard({
  person,
  tree,
}: {
  /** The person this card is actually about (== `tree.person`, the
   * composante familiale's own sommet — see `buildVillageTrees`). Passed
   * explicitly to the fullscreen dialog's title rather than left to derive
   * it from `tree.person` implicitly: the two happened to diverge under a
   * previous (now-removed) "biggest tree wins" strategy, silently mislabeling
   * the fullscreen view. */
  person: Person;
  tree: FamilyTreeNode;
}) {
  const people = useMemo(() => collectTreePeople(tree), [tree]);
  const titre = `Famille ${person.lastName}`;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <GitFork className="size-3.5 text-primary" />
        {titre}
      </p>
      <GenealogyTree root={tree} people={people} className="h-72" compact title={titre} />
    </div>
  );
}

export default function GenealogyTreePage() {
  const { personId: routePersonId } = useParams();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [dismissedHint, setDismissedHint] = useState(false);
  const utilisateur = useAuthStore((s) => s.utilisateur);

  const { data: index, loading, error, refetch } = useAsync(() => fetchVillageIndex(), []);

  const [mode, setMode] = useState<ViewMode>("village");
  const [selectedPersonId, setSelectedPersonId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(VILLAGE_BATCH_SIZE);

  // Deep-link support (e.g. /arbre/:personId shared from elsewhere): only
  // switches away from the default village view once the id in the URL
  // resolves to a real recensed person — an unrecognised id (including a
  // stale link that used to point at a famille) is never treated as a
  // person to invent, and the page just stays on "Tout le village".
  useEffect(() => {
    if (routePersonId && index?.byId.has(routePersonId)) {
      setMode("person");
      setSelectedPersonId(routePersonId);
    }
  }, [routePersonId, index]);

  function goToVillage() {
    setMode("village");
    setSelectedPersonId(undefined);
    navigate("/arbre");
  }

  function goToMoi() {
    setMode("moi");
    setSelectedPersonId(undefined);
    navigate("/arbre");
  }

  function goToPerson(id: string) {
    setMode("person");
    setSelectedPersonId(id);
    setSearchOpen(false);
    navigate(`/arbre/${id}`);
  }

  const moiPersonId = utilisateur?.personneUuid;
  const activePersonId = mode === "moi" ? moiPersonId : mode === "person" ? selectedPersonId : undefined;

  // "Moi" seul reçoit l'arbre récursif/sans limite (`buildPersonalTree`) —
  // "Tout le village" et "Rechercher une personne" gardent l'arbre à trois
  // niveaux fixes (`buildIndividualTree`), inchangé.
  const activeTree = useMemo(() => {
    if (!index || !activePersonId) return undefined;
    return mode === "moi"
      ? buildPersonalTree(activePersonId, index)
      : buildIndividualTree(activePersonId, index);
  }, [index, activePersonId, mode]);
  const activeTreePeople = useMemo(() => (activeTree ? collectTreePeople(activeTree) : []), [activeTree]);

  // Un père, une mère et leur enfant produisent chacun leur propre arbre
  // individuel, quasi identiques (même couple, même enfant) — dédupliqués
  // par famille avant pagination pour n'afficher qu'une seule carte par
  // lignée réellement distincte (voir buildVillageTrees).
  const villageEntries = useMemo(
    () => (index ? buildVillageTrees(index.people, index) : []),
    [index],
  );
  const visibleEntries = useMemo(() => villageEntries.slice(0, visibleCount), [villageEntries, visibleCount]);

  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col gap-4 lg:h-[calc(100vh-8.5rem)] lg:gap-5">
      <PageHeader
        eyebrow="Généalogie"
        title="Arbre généalogique du village"
        description={
          isMobile
            ? undefined
            : "Une carte par famille parents, conjoint·e et enfants réellement enregistrés."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={mode === "village" ? "default" : "outline"} size="sm" onClick={goToVillage}>
          <Users /> Tout le village
        </Button>
        <Button
          variant={mode === "moi" ? "default" : "outline"}
          size="sm"
          onClick={goToMoi}
          disabled={!moiPersonId}
          title={moiPersonId ? undefined : "Votre compte n'est associé à aucune fiche personne."}
        >
          <User /> Moi
        </Button>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button variant={mode === "person" ? "default" : "outline"} size="sm">
              <Search /> Rechercher une personne
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Nom d'une personne recensée…" />
              <CommandList>
                <CommandEmpty>Personne introuvable.</CommandEmpty>
                {(index?.people ?? []).slice(0, 100).map((p) => (
                  <CommandItem key={p.id} value={fullName(p)} onSelect={() => goToPerson(p.id)}>
                    <PersonAvatar person={p} size="xs" />
                    <span className="truncate">{fullName(p)}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {mode === "person" && selectedPersonId && (
          <Button variant="ghost" size="sm" onClick={goToVillage}>
            <X /> Effacer
          </Button>
        )}
      </div>

      {isMobile && !dismissedHint && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
          <Smartphone className="size-4 shrink-0 text-primary" />
          <p className="flex-1">
            Glissez avec un doigt pour vous déplacer, pincez avec deux doigts pour zoomer.
          </p>
          <button onClick={() => setDismissedHint(true)} aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {loading ? (
          <Skeleton className="size-full rounded-xl" />
        ) : error || !index ? (
          <DataErrorState error={error ?? new Error("Données indisponibles")} onRetry={refetch} />
        ) : mode === "village" ? (
          <VillageTrees
            visibleEntries={visibleEntries}
            hasMore={visibleCount < villageEntries.length}
            onShowMore={() => setVisibleCount((c) => c + VILLAGE_BATCH_SIZE)}
          />
        ) : mode === "moi" && !moiPersonId ? (
          <EmptyState
            icon={User}
            title="Aucune fiche personne associée"
            description="Votre compte n'est associé à aucune fiche personne recensée impossible d'afficher votre arbre."
          />
        ) : activeTree ? (
          <GenealogyTree
            key={activeTree.person.id}
            root={activeTree}
            people={activeTreePeople}
            className="size-full"
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Personne introuvable"
            description="Recherchez une personne réellement recensée pour afficher son arbre individuel."
          />
        )}
      </div>
    </div>
  );
}

function VillageTrees({
  visibleEntries,
  hasMore,
  onShowMore,
}: {
  visibleEntries: VillageTreeEntry[];
  hasMore: boolean;
  onShowMore: () => void;
}) {
  if (visibleEntries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Aucune personne recensée"
        description="Les arbres individuels apparaîtront ici dès qu'une personne sera recensée."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleEntries.map(({ subject, tree }) => (
          <IndividualTreeCard key={subject.id} person={subject} tree={tree} />
        ))}
      </div>
      {hasMore && (
        <Button variant="outline" size="sm" className="mx-auto" onClick={onShowMore}>
          Afficher plus d'arbres
        </Button>
      )}
    </div>
  );
}
