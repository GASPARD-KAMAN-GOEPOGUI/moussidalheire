import { apiRequest } from "@/lib/api-client";
import { notifyDataChanged } from "@/lib/sync-bus";
import type { NewsCategoryRef } from "@/types";

export interface CategorieActualiteApi {
  id: number;
  uuid: string;
  nom: string;
  slug: string;
  description?: string | null;
  statut?: string | null;
  deletedAt?: string | null;
}

interface CategorieActualiteResponse {
  success: true;
  categorie: CategorieActualiteApi;
}
interface CategoriesActualitesListResponse {
  success: true;
  categories: CategorieActualiteApi[];
}

function toCategoryRef(c: CategorieActualiteApi): NewsCategoryRef {
  return { id: c.uuid, nom: c.nom, slug: c.slug };
}

/** Same trade-off as `resolveFamilleNumericId` in `families.ts`: the
 * frontend identifies a category by uuid, the backend's `categorieId` filter
 * expects the internal numeric id. Populated by every list/create call. */
const numericIdByUuid = new Map<string, number>();
function cache(categories: CategorieActualiteApi[]): void {
  for (const c of categories) numericIdByUuid.set(c.uuid, c.id);
}

export async function resolveCategorieNumericId(uuid: string): Promise<number | undefined> {
  const cached = numericIdByUuid.get(uuid);
  if (cached !== undefined) return cached;
  try {
    const res = await apiRequest<CategorieActualiteResponse>(`/categories-actualites/${uuid}`);
    numericIdByUuid.set(uuid, res.categorie.id);
    return res.categorie.id;
  } catch {
    return undefined;
  }
}

export async function listNewsCategories(): Promise<NewsCategoryRef[]> {
  const res = await apiRequest<CategoriesActualitesListResponse>(
    "/categories-actualites?pageSize=100",
  );
  cache(res.categories);
  return res.categories.map(toCategoryRef);
}

export interface CategorieActualiteInput {
  nom: string;
  slug: string;
  description?: string;
}

/** Admin-only on the backend (`requireRole("admin")`) — the "+" button next
 * to the Actualités filter chips is hidden for non-admins, and the API
 * itself rejects the request regardless. */
export async function creerCategorieActualiteReelle(
  input: CategorieActualiteInput,
): Promise<NewsCategoryRef> {
  const res = await apiRequest<CategorieActualiteResponse>("/categories-actualites", {
    method: "POST",
    body: input,
  });
  cache([res.categorie]);
  notifyDataChanged("categorie-actualite", res.categorie.uuid);
  return toCategoryRef(res.categorie);
}
