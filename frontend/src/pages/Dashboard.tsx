import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocation } from "react-router-dom";
import { GitFork, Globe2, Home as HomeIcon, MapPinned, Newspaper, UserPlus, Users, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NewsCard } from "@/components/news/NewsCard";
import { useAsync } from "@/hooks/useAsync";
import {
  getFamilyBreakdown,
  getGenerationBreakdown,
  getRecentNews,
  getResidenceBreakdown,
  getVillageStats,
} from "@/services/api";

const RESIDENCE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"];

export default function Dashboard() {
  const { key } = useLocation();
  const { data: stats, loading: statsLoading } = useAsync(() => getVillageStats(), [key]);
  const { data: familyBreakdown } = useAsync(() => getFamilyBreakdown(), [key]);
  const { data: generationBreakdown } = useAsync(() => getGenerationBreakdown(), [key]);
  const { data: residenceBreakdown } = useAsync(() => getResidenceBreakdown(), [key]);
  const { data: news } = useAsync(() => getRecentNews(3), []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Vue d'ensemble"
        title="Tableau de bord du village"
        description="Une synthèse en temps réel du recensement, des familles et de la vie du village."
      />

      {statsLoading || !stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Population totale" value={stats.totalPopulation} accent="primary" />
          <StatCard icon={UsersRound} label="Familles" value={stats.totalFamilies} accent="accent" />
          <StatCard icon={GitFork} label="Générations" value={stats.totalGenerations} accent="success" />
          <StatCard icon={UserPlus} label="Nouveaux ce mois-ci" value={stats.newThisMonth} accent="muted" />
          <StatCard icon={HomeIcon} label="Vivent au village" value={stats.livingInVillage} accent="primary" />
          <StatCard icon={MapPinned} label="Ailleurs en Guinée" value={stats.livingElsewhereInCountry} accent="accent" />
          <StatCard icon={Globe2} label="À l'étranger" value={stats.livingAbroad} accent="success" />
          <StatCard icon={Newspaper} label="Décès enregistrés" value={stats.deceasedRecorded} accent="muted" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Répartition géographique</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {residenceBreakdown ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={residenceBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {residenceBreakdown.map((_, i) => (
                      <Cell key={i} fill={RESIDENCE_COLORS[i % RESIDENCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="size-full rounded-lg" />
            )}
          </CardContent>
          <div className="flex flex-wrap justify-center gap-3 px-5 pb-5">
            {residenceBreakdown?.map((r, i) => (
              <span key={r.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: RESIDENCE_COLORS[i] }} />
                {r.name} ({r.value})
              </span>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Membres par famille</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {familyBreakdown ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={familyBreakdown} margin={{ left: -20 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(var(--chart-1))" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="size-full rounded-lg" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Population par génération</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          {generationBreakdown ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={generationBreakdown.map((g) => ({ ...g, label: `Gén. ${g.generation}` }))} margin={{ left: -20 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="size-full rounded-lg" />
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <CardTitle className="text-lg">Dernières actualités</CardTitle>
        {news ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {news.map((n) => (
              <NewsCard key={n.id} news={n} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
