import { listPeople } from "./people";
import { listFamilies, type FamilySummary } from "./families";
import { listNews } from "./news";
import { searchLieux } from "./lieux";
import type { Location, NewsItem, Person } from "@/types";

export interface GlobalSearchResults {
  people: Person[];
  families: FamilySummary[];
  locations: Location[];
  news: NewsItem[];
}

const EMPTY: GlobalSearchResults = { people: [], families: [], locations: [], news: [] };

/**
 * Habitants, familles, actualités et lieux sont tous cherchés en réel
 * (`recherche` sur `/personnes`/`/familles`/`/actualites`, et `/lieux` pour
 * les lieux — voir `lieux.ts::searchLieux`) — sans restriction RBAC ajoutée
 * côté client : `/personnes` et `/lieux` sont déjà ouverts à tous (lecture
 * publique, aucun filtrage d'univers), `/familles` applique déjà son propre
 * filtrage d'univers pour un membre (`resoudreUniversFamilial`), et
 * `/actualites` exige un compte connecté (voir `actualite.routes.ts`). Le
 * backend ne substring-matche que prénom/nom (personnes), nom (familles),
 * titre (actualités) et ville/pays (lieux) — plus étroit que l'ancien mock
 * qui incluait aussi surnom/profession/résumé/extrait.
 *
 * `Promise.allSettled`, pas `Promise.all` : une seule catégorie qui échoue
 * (ex. session expirée pendant l'appel `/actualites`) ne doit jamais faire
 * disparaître silencieusement les résultats des trois autres.
 */
export async function globalSearch(query: string, limit = 6): Promise<GlobalSearchResults> {
  const q = query.trim();
  if (!q) return EMPTY;

  const [peopleRes, familiesRes, newsRes, locationsRes] = await Promise.allSettled([
    listPeople({ search: q, pageSize: limit }),
    listFamilies(q),
    listNews({ search: q, pageSize: limit }),
    searchLieux(q),
  ]);

  return {
    people: peopleRes.status === "fulfilled" ? peopleRes.value.items : [],
    families: familiesRes.status === "fulfilled" ? familiesRes.value.slice(0, limit) : [],
    news: newsRes.status === "fulfilled" ? newsRes.value.items : [],
    locations: locationsRes.status === "fulfilled" ? locationsRes.value.slice(0, limit) : [],
  };
}
