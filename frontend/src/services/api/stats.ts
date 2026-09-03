import { apiRequest, apiRequestPublic } from "@/lib/api-client";
import type { PersonneApi } from "./mappers";
import type { VillageStats } from "@/types";

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
interface PersonnesListResponse {
  success: true;
  personnes: PersonneApi[];
  pagination: PaginationMeta;
}

/** No dedicated aggregate endpoint exists for "total generations"/"nouveaux
 * ce mois-ci"/"décès enregistrés"/"familles" (couples avec enfant), so this
 * paginates through every personne (bounded by `MAX_STATS_PAGES`, a safety
 * ceiling rather than an expected real size) — same village-scale trade-off
 * as `listProfessions()` in people.ts. `totalPopulation` is the one exception:
 * a single exact, uncapped count straight from the backend's own pagination
 * (`estDecede=false`, pageSize=1), never a client count of one capped page.
 *
 * `livingInVillage`/`livingElsewhereInCountry`/`livingAbroad` are classified
 * from the simplified `estAuVillage`/`estEnGuinee` booleans (see
 * mappers.ts) — never from `residenceActuelle` (a different, more detailed
 * système, still used elsewhere for "vit à X" but not for this village-wide
 * breakdown): `estAuVillage` → au village ; `estAuVillage` faux et
 * `estEnGuinee` vrai → ailleurs en Guinée ; les deux faux → à l'étranger. Une
 * personne décédée n'est jamais comptée dans aucune des trois catégories —
 * sa situation géographique n'est pas pertinente une fois décédée.
 */
const MAX_STATS_PAGES = 20;

function classerSituationGeographique(p: PersonneApi): "village" | "guinee" | "etranger" | undefined {
  if (p.estDecede) return undefined;
  if (p.estAuVillage) return "village";
  return p.estEnGuinee ? "guinee" : "etranger";
}

export async function getVillageStats(): Promise<VillageStats> {
  // Exact, uncapped count straight from the backend's own pagination — never
  // a client count of one capped page (see MAX_STATS_PAGES below for what
  // that trade-off looks like for the derived stats that do need it).
  const populationVivanteRes = await apiRequest<PersonnesListResponse>(
    "/personnes?estDecede=false&page=1&pageSize=1",
  );
  const totalPopulation = populationVivanteRes.pagination.total;

  const generations = new Set<number>();
  // "Familles" = couples parents ayant au moins un enfant enregistré — une
  // paire (pereId, mereId) distincte par couple, jamais le nombre de lignées
  // (table `Famille`) : deux couples dans la même lignée comptent pour 2.
  const couplesAvecEnfant = new Set<string>();
  let newThisMonth = 0;
  let deceasedRecorded = 0;
  let livingInVillage = 0;
  let livingElsewhereInCountry = 0;
  let livingAbroad = 0;
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  let page = 1;
  for (;;) {
    const res = await apiRequest<PersonnesListResponse>(`/personnes?page=${page}&pageSize=100`);
    for (const p of res.personnes) {
      generations.add(p.generation);
      if (new Date(p.createdAt) >= monthAgo) newThisMonth++;
      if (p.estDecede) deceasedRecorded++;
      if (p.pereId != null && p.mereId != null) couplesAvecEnfant.add(`${p.pereId}-${p.mereId}`);
      const situation = classerSituationGeographique(p);
      if (situation === "village") livingInVillage++;
      else if (situation === "guinee") livingElsewhereInCountry++;
      else if (situation === "etranger") livingAbroad++;
    }
    if (page >= res.pagination.totalPages || page >= MAX_STATS_PAGES) break;
    page += 1;
  }

  return {
    totalPopulation,
    totalFamilies: couplesAvecEnfant.size,
    totalGenerations: generations.size,
    livingInVillage,
    livingElsewhereInCountry,
    livingAbroad,
    newThisMonth,
    deceasedRecorded,
  };
}

/** Same `/personnes` pagination walk as `getVillageStats()` above, grouping
 * by `generation` instead of collecting a `Set` — bounded by the same
 * `MAX_STATS_PAGES` safety ceiling. */
export async function getGenerationBreakdown() {
  const byGen = new Map<number, number>();
  let page = 1;
  for (;;) {
    const res = await apiRequest<PersonnesListResponse>(`/personnes?page=${page}&pageSize=100`);
    for (const p of res.personnes) {
      byGen.set(p.generation, (byGen.get(p.generation) ?? 0) + 1);
    }
    if (page >= res.pagination.totalPages || page >= MAX_STATS_PAGES) break;
    page += 1;
  }
  return Array.from(byGen.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([generation, count]) => ({ generation, count }));
}

interface FamillesPubliquesListResponse {
  success: true;
  familles: { id: number; nom: string }[];
}

/**
 * Regroupée par nom de famille, pas par ligne `Famille` : deux lignes distinctes
 * portant le même nom (ex. deux inscriptions fondant chacune leur famille sous
 * le même patronyme, jamais fusionnées automatiquement — voir famille.service.ts
 * côté backend) doivent apparaître comme une seule barre, leurs membres additionnés.
 *
 * `GET /familles` restreint sa réponse à l'univers familial de l'utilisateur
 * connecté (son propre clan) quand un jeton est attaché — un vrai choix RBAC
 * pour la page "Familles", mais faux ici : cette statistique doit rester
 * globale pour tout le monde (voir getVillageStats ci-dessus). D'où
 * `apiRequestPublic`, jamais `apiRequest`, pour ce seul appel — la même vue
 * publique que le backend sert déjà à un visiteur non connecté. Les
 * effectifs, eux, viennent du même comptage `/personnes` que le reste de ce
 * fichier (déjà global, jamais restreint).
 */
export async function getFamilyBreakdown() {
  const famillesRes = await apiRequestPublic<FamillesPubliquesListResponse>("/familles?pageSize=100");
  const nomParFamilleId = new Map(famillesRes.familles.map((f) => [f.id, f.nom]));

  const countByName = new Map<string, number>();
  let page = 1;
  for (;;) {
    const res = await apiRequest<PersonnesListResponse>(`/personnes?page=${page}&pageSize=100`);
    for (const p of res.personnes) {
      const nomBrut = nomParFamilleId.get(p.familleId) ?? "Famille inconnue";
      const name = nomBrut.replace("Famille ", "");
      countByName.set(name, (countByName.get(name) ?? 0) + 1);
    }
    if (page >= res.pagination.totalPages || page >= MAX_STATS_PAGES) break;
    page += 1;
  }
  return Array.from(countByName.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Same `/personnes` pagination walk as `getVillageStats()` above — deceased
 * personnes are already excluded by `classerSituationGeographique` itself. */
export async function getResidenceBreakdown() {
  const counts = { village: 0, guinee: 0, etranger: 0 };
  let page = 1;
  for (;;) {
    const res = await apiRequest<PersonnesListResponse>(`/personnes?page=${page}&pageSize=100`);
    for (const p of res.personnes) {
      const situation = classerSituationGeographique(p);
      if (situation) counts[situation]++;
    }
    if (page >= res.pagination.totalPages || page >= MAX_STATS_PAGES) break;
    page += 1;
  }
  return [
    { name: "Au village", value: counts.village },
    { name: "Ailleurs en Guinée", value: counts.guinee },
    { name: "À l'étranger", value: counts.etranger },
  ];
}
