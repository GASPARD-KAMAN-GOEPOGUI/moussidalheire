import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Check, Link2, Newspaper, Pencil, Power, PowerOff, UsersRound } from "lucide-react";
import { NewsCategoryBadge } from "@/components/news/NewsCategoryBadge";
import { AddNewsDialog } from "@/components/news/AddNewsDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAsync } from "@/hooks/useAsync";
import { getNewsItem, toggleNewsActive } from "@/services/api/news";
import { getFamily } from "@/services/api/families";
import { ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/useAuthStore";

/** The full "actualité" detail — cover image, category, title, share, edit &
 * deactivate actions, content, related family. Shared by the /actualites/:id
 * page and the quick-open article modal (`NewsDetailDialog`), same pattern
 * as `PersonProfileContent`/`PersonProfileDialog`. */
export function NewsDetailContent({ id }: { id: string }) {
  const { data: news, loading, refetch } = useAsync(() => getNewsItem(id), [id]);
  const { data: relatedFamily } = useAsync(
    () => (news?.relatedFamilyId ? getFamily(news.relatedFamilyId) : Promise.resolve(undefined)),
    [news?.relatedFamilyId],
  );
  const isAdmin = useAuthStore((s) => s.utilisateur?.role === "admin");
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");

  const share = async () => {
    const url = `${window.location.origin}/actualites/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: news?.title, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  async function handleToggleActive() {
    if (!news) return;
    setToggling(true);
    setToggleError("");
    try {
      await toggleNewsActive(news.id, !news.isActive);
      setConfirmOpen(false);
      refetch();
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-8 w-2/3 rounded" />
        <Skeleton className="h-32 rounded" />
      </div>
    );
  }

  if (!news) {
    return (
      <EmptyState
        icon={Newspaper}
        title="Actualité introuvable"
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/actualites">Retour aux actualités</Link>
          </Button>
        }
      />
    );
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      {!news.isActive && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          Cette actualité est désactivée elle n'apparaît plus dans la liste des actualités.
        </div>
      )}

      {news.coverImageUrl && (
        <div className="overflow-hidden rounded-2xl border border-border">
          <img src={news.coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <NewsCategoryBadge category={news.category} />
            <span className="text-xs text-muted-foreground">
              {format(new Date(news.publishedAt), "d MMMM yyyy", { locale: fr })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil />
              Modifier
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className={news.isActive ? "text-destructive hover:text-destructive" : "text-success hover:text-success"}
                onClick={() => setConfirmOpen(true)}
              >
                {news.isActive ? <PowerOff /> : <Power />}
                {news.isActive ? "Désactiver" : "Réactiver"}
              </Button>
            )}
          </div>
        </div>
        <h1 className="font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">
          {news.title}
        </h1>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Par {news.authorName}</p>
          <Button variant="outline" size="sm" onClick={share}>
            {copied ? <Check /> : <Link2 />}
            {copied ? "Lien copié" : "Partager"}
          </Button>
        </div>
      </div>

      <div className="prose prose-sm max-w-none space-y-4 text-[15px] leading-relaxed text-foreground/90">
        {news.content.split("\n").map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {relatedFamily && (
        <div className="space-y-3 border-t border-border pt-6">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <UsersRound className="size-4" />
            Famille liée
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground">
              {relatedFamily.name}
            </span>
          </div>
        </div>
      )}

      <AddNewsDialog open={editOpen} onOpenChange={setEditOpen} onCreated={refetch} editing={news} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{news.isActive ? "Désactiver cette actualité ?" : "Réactiver cette actualité ?"}</DialogTitle>
            <DialogDescription>
              {news.isActive
                ? "Elle ne sera plus visible dans la liste des actualités ni sur l'accueil, mais reste accessible par son lien direct."
                : "Elle redeviendra visible dans la liste des actualités."}
            </DialogDescription>
          </DialogHeader>
          {toggleError && (
            <p role="alert" className="text-sm text-destructive">
              {toggleError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant={news.isActive ? "destructive" : "default"}
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {news.isActive ? <PowerOff /> : <Power />}
              {toggling ? "Veuillez patienter…" : news.isActive ? "Désactiver" : "Réactiver"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
