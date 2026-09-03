import { useEffect, useState } from "react";
import { Baby, LayoutGrid, List, SearchX, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { PersonCard } from "@/components/people/PersonCard";
import { AddMyChildDialog } from "@/components/people/AddMyChildDialog";
import { useAsync } from "@/hooks/useAsync";
import { useDebounce } from "@/hooks/useDebounce";
import { listPeople } from "@/services/api/people";
import { cn } from "@/lib/utils";

export default function People() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 250);

  useEffect(() => setPage(1), [debouncedSearch]);

  const { data, loading, refetch } = useAsync(
    () => listPeople({ search: debouncedSearch || undefined, page, pageSize: 24 }),
    [debouncedSearch, page],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recensement"
        title="Habitants du village"
        description="Recherchez et parcourez l'ensemble de la population enregistrée."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Baby />
            Ajouter mes enfants
          </Button>
        }
      />

      <AddMyChildDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refetch} />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row">
        <Input
          placeholder="Rechercher par nom, prénom ou profession…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:flex-1"
        />
        <div className="flex gap-2">
          <Button
            variant={view === "grid" ? "secondary" : "outline"}
            size="icon"
            onClick={() => setView("grid")}
            aria-label="Vue grille"
          >
            <LayoutGrid />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "outline"}
            size="icon"
            onClick={() => setView("list")}
            aria-label="Vue liste"
          >
            <List />
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <div
          className={cn(
            "grid gap-4",
            view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1",
          )}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={view === "grid" ? "h-64 rounded-xl" : "h-20 rounded-xl"} />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Aucun habitant ne correspond à cette recherche"
          description="Essayez un autre nom, prénom ou une autre profession."
          action={
            search && (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Effacer la recherche
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4" />
            {data.total} habitant{data.total > 1 ? "s" : ""} trouvé{data.total > 1 ? "s" : ""}
          </p>
          <div
            className={cn(
              "grid gap-4",
              view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1",
            )}
          >
            {data.items.map((p) => (
              <PersonCard key={p.id} person={p} variant={view} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
