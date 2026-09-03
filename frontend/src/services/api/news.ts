import { apiRequest, ApiError } from "@/lib/api-client";
import { toNewsItem, type ActualiteApi } from "./mappers";
import { resolveCategorieNumericId } from "./categories-actualites";
import { resolveFamilleNumericId } from "./families";
import { notifyDataChanged } from "@/lib/sync-bus";
import type { NewsInput, NewsItem } from "@/types";

export interface NewsQuery {
  search?: string;
  /** A category's uuid (`NewsCategoryRef.id`). */
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface NewsPage {
  items: NewsItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ActualitesListResponse {
  success: true;
  actualites: ActualiteApi[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
interface ActualiteResponse {
  success: true;
  actualite: ActualiteApi;
}

export async function listNews(query: NewsQuery = {}): Promise<NewsPage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 9;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.search) params.set("recherche", query.search);
  if (query.category) {
    const categorieId = await resolveCategorieNumericId(query.category);
    if (categorieId !== undefined) params.set("categorieId", String(categorieId));
  }
  const res = await apiRequest<ActualitesListResponse>(`/actualites?${params.toString()}`);
  return {
    items: res.actualites.map(toNewsItem),
    total: res.pagination.total,
    page: res.pagination.page,
    pageSize: res.pagination.pageSize,
    totalPages: res.pagination.totalPages,
  };
}

export async function getNewsItem(id: string): Promise<NewsItem | undefined> {
  try {
    const res = await apiRequest<ActualiteResponse>(`/actualites/${id}`);
    return toNewsItem(res.actualite);
  } catch {
    return undefined;
  }
}

export async function getRecentNews(count = 4): Promise<NewsItem[]> {
  const res = await apiRequest<ActualitesListResponse>(`/actualites?pageSize=${count}`);
  return res.actualites.map(toNewsItem);
}

/** Shared by `createNews`/`updateNews` — the backend's `PUT` route uses the
 * exact same schema as `POST` (full replace, no PATCH — see
 * `actualite.validator.ts`), so both send the identical payload shape. */
async function buildActualitePayload(input: NewsInput): Promise<Record<string, unknown>> {
  const categorieId = await resolveCategorieNumericId(input.categoryId);
  if (categorieId === undefined) {
    throw new ApiError(404, "Catégorie d'actualité introuvable.");
  }
  const familleId = input.relatedFamilyId
    ? await resolveFamilleNumericId(input.relatedFamilyId)
    : undefined;
  return {
    titre: input.title,
    categorieId,
    ...(input.coverImageUrl ? { imageCouverture: input.coverImageUrl } : {}),
    resume: input.excerpt,
    contenu: input.content,
    ...(input.authorName.trim() ? { auteur: input.authorName.trim() } : {}),
    ...(input.featured ? { miseEnAvant: true } : {}),
    ...(familleId !== undefined ? { familleId } : {}),
  };
}

export async function createNews(input: NewsInput): Promise<NewsItem> {
  const res = await apiRequest<ActualiteResponse>("/actualites", {
    method: "POST",
    body: await buildActualitePayload(input),
  });
  notifyDataChanged("actualite", res.actualite.uuid);
  return toNewsItem(res.actualite);
}

export async function updateNews(id: string, input: NewsInput): Promise<NewsItem> {
  const res = await apiRequest<ActualiteResponse>(`/actualites/${id}`, {
    method: "PUT",
    body: await buildActualitePayload(input),
  });
  notifyDataChanged("actualite", id);
  return toNewsItem(res.actualite);
}

/** Admin-only on the backend (`requireRole("admin")`) — the désactiver/
 * réactiver button on `NewsDetail` is hidden for non-admins, and the API
 * itself rejects the request regardless. Never a physical delete. */
export async function toggleNewsActive(id: string, active: boolean): Promise<NewsItem | undefined> {
  await apiRequest(`/actualites/${id}/${active ? "restaurer" : "desactiver"}`, { method: "POST" });
  notifyDataChanged("actualite", id);
  return getNewsItem(id);
}
