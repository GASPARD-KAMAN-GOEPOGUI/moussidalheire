import { useEffect, useState } from "react";
import { Newspaper, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { Pagination } from "@/components/shared/Pagination";
import { NewsCard } from "@/components/news/NewsCard";
import { AddNewsDialog } from "@/components/news/AddNewsDialog";
import { AddNewsCategoryDialog } from "@/components/news/AddNewsCategoryDialog";
import { useAsync } from "@/hooks/useAsync";
import { useDebounce } from "@/hooks/useDebounce";
import { listNews } from "@/services/api/news";
import { listNewsCategories } from "@/services/api/categories-actualites";
import { useAuthStore } from "@/store/useAuthStore";
import type { NewsCategoryRef } from "@/types";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export default function News() {
  const isAdmin = useAuthStore((s) => s.utilisateur?.role === "admin");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [categories, setCategories] = useState<NewsCategoryRef[]>([]);
  const debounced = useDebounce(search, 250);

  useEffect(() => setPage(1), [debounced, category]);

  function refetchCategories() {
    listNewsCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }
  useEffect(refetchCategories, []);

  const { data, loading, error, refetch } = useAsync(
    () =>
      listNews({
        search: debounced || undefined,
        category: category === ALL ? undefined : category,
        page,
        pageSize: 9,
      }),
    [debounced, category, page],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communauté"
        title="Actualités du village"
        description="Annonces, cérémonies, naissances, projets communautaires : toute la vie du village."
        actions={
          <div className="flex flex-col gap-2">
            {isAdmin && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus />
                Publier une actualité
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setAddCategoryOpen(true)}>
                <Plus />
                Créer un type d'actualité
              </Button>
            )}
          </div>
        }
      />

      <AddNewsDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refetch} />
      <AddNewsCategoryDialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        onCreated={(created) => {
          setCategories((prev) => [...prev, created]);
          setCategory(created.id);
        }}
      />

      {/* Sur téléphone, les deux contrôles passent en pleine largeur pour avoir
          exactement la même taille une fois empilés. À partir de `sm`, on
          retrouve la ligne unique : le champ occupe la place restante à côté
          du sélecteur de 14rem. */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Rechercher une actualité…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-auto sm:min-w-[200px] sm:flex-1"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-56 sm:shrink-0">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les catégories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : error || !data ? (
        <DataErrorState error={error ?? new Error("Données indisponibles")} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Aucune actualité trouvée"
          description="Essayez une autre catégorie ou un autre mot-clé."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((n) => (
              <NewsCard key={n.id} news={n} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
