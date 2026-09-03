import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { NewsCategoryBadge } from "./NewsCategoryBadge";
import { NewsDetailDialog } from "./NewsDetailDialog";
import type { NewsItem } from "@/types";
import { cn } from "@/lib/utils";

export function NewsCard({ news, featured = false }: { news: NewsItem; featured?: boolean }) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className={cn(
          "group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg",
          featured && "sm:col-span-2 sm:flex-row",
        )}
      >
        <div
          className={cn(
            "relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-muted",
            featured && "sm:aspect-auto sm:w-2/5",
          )}
        >
          {news.coverImageUrl && (
            <img
              src={news.coverImageUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          <div className="absolute left-3 top-3">
            <NewsCategoryBadge category={news.category} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {format(new Date(news.publishedAt), "d MMMM yyyy", { locale: fr })} · {news.authorName}
          </p>
          <h3
            className={cn(
              "font-display font-bold leading-snug text-foreground group-hover:text-primary",
              featured ? "text-xl" : "text-base line-clamp-2",
            )}
          >
            {news.title}
          </h3>
          <p className={cn("text-sm text-muted-foreground", featured ? "line-clamp-3" : "line-clamp-2")}>
            {news.excerpt}
          </p>
        </div>
      </button>
      <NewsDetailDialog id={news.id} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
