import { Link, useLocation } from "react-router-dom";
import { ArrowRight, GitFork, Newspaper, Search, UsersRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { NewsCard } from "@/components/news/NewsCard";
import { useAsync } from "@/hooks/useAsync";
import { getVillageStats, getRecentNews } from "@/services/api";
import { VILLAGE_NAME, PLATFORM_NAME } from "@/data/mock/pools";
import villageImg from "@/assets/imageVillage.jpeg";

export default function Home() {
  const { key } = useLocation();
  // Deux sections indépendantes : si les chiffres tombent, les actualités
  // peuvent très bien s'afficher (et l'inverse). Chacune porte donc son propre
  // état d'erreur plutôt qu'un message unique pour toute la page d'accueil.
  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useAsync(() => getVillageStats(), [key]);
  const {
    data: news,
    loading: newsLoading,
    error: newsError,
    refetch: refetchNews,
  } = useAsync(() => getRecentNews(3), []);

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border">
        <img
          src={villageImg}
          alt={`Le village de ${VILLAGE_NAME}`}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/20" />
        <div className="relative flex min-h-[420px] flex-col justify-end gap-5 p-6 sm:p-10 lg:p-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            {PLATFORM_NAME} Mémoire vivante du village
          </p>
          <h1 className="max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            Toute l'histoire du village, ses familles et ses générations, au même endroit.
          </h1>
          <p className="max-w-xl text-balance text-sm text-white/80 sm:text-base">
            Recensez les habitants, explorez l'arbre généalogique du village, retrouvez où vivent
            vos proches aujourd'hui et suivez l'actualité de la communauté, au village comme dans
            la diaspora.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg">
              <Link to="/arbre">
                <GitFork />
                Explorer l'arbre généalogique
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/habitants">
                <Search />
                Rechercher un habitant
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="space-y-5">
        <SectionHeading title="Le village en quelques chiffres" viewAllHref="/dashboard" viewAllLabel="Tableau de bord complet" />
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : statsError || !stats ? (
          <DataErrorState error={statsError ?? new Error("Données indisponibles")} onRetry={refetchStats} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Users} label="Habitants recensés" value={stats.totalPopulation} accent="primary" />
            <StatCard icon={UsersRound} label="Familles" value={stats.totalFamilies} accent="accent" />
            <StatCard icon={GitFork} label="Générations" value={stats.totalGenerations} accent="success" />
            <StatCard icon={Newspaper} label="Nouveaux ce mois-ci" value={stats.newThisMonth} accent="muted" />
          </div>
        )}
      </section>

      {/* Quick access */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { to: "/habitants", icon: Users, title: "Annuaire des habitants", desc: "Parcourez et filtrez toute la population du village." },
          { to: "/arbre", icon: GitFork, title: "Arbre généalogique", desc: "Naviguez de génération en génération, branche par branche." },
          { to: "/familles", icon: UsersRound, title: "Familles du village", desc: "Découvrez l'histoire et les membres de chaque lignée." },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <item.icon className="size-5" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground group-hover:text-primary">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
              Découvrir <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      {/* News preview */}
      <section className="space-y-5">
        <SectionHeading title="Actualités récentes du village" viewAllHref="/actualites" />
        {newsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : newsError || !news ? (
          <DataErrorState error={newsError ?? new Error("Données indisponibles")} onRetry={refetchNews} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {news.map((n) => (
              <NewsCard key={n.id} news={n} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
