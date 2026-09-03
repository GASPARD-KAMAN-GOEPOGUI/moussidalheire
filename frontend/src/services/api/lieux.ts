/** The `Lieu` referential table — reusable places (village/city/country),
 * never duplicated onto a personne's résidence record. See
 * `backend/src/services/lieu.service.ts`. */
import { apiRequest } from "@/lib/api-client";
import { notifyDataChanged } from "@/lib/sync-bus";
import type { Location } from "@/types";

export interface LieuApi {
  id: number;
  uuid: string;
  pays: string;
  region?: string | null;
  ville: string;
  quartier?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  estVillage: boolean;
  deletedAt?: string | null;
}

interface LieuxListResponse {
  success: true;
  lieux: LieuApi[];
}

interface LieuResponse {
  success: true;
  lieu: LieuApi;
}

export function toLocation(l: LieuApi): Location {
  return {
    id: l.uuid,
    country: l.pays,
    city: l.ville,
    ...(l.region ? { region: l.region } : {}),
    ...(l.quartier ? { district: l.quartier } : {}),
    ...(l.estVillage ? { isVillage: true } : {}),
    ...(l.latitude != null ? { lat: Number(l.latitude) } : {}),
    ...(l.longitude != null ? { lng: Number(l.longitude) } : {}),
  };
}

/** Village-scale trade-off: no dedicated autocomplete endpoint — a single
 * page (pageSize 50) of `/lieux?recherche=` is plenty for a village-sized
 * référentiel of places. */
export async function searchLieux(query: string): Promise<Location[]> {
  const params = new URLSearchParams({ pageSize: "50" });
  if (query.trim()) params.set("recherche", query.trim());
  const res = await apiRequest<LieuxListResponse>(`/lieux?${params.toString()}`);
  return res.lieux.map(toLocation);
}

export interface LieuInput {
  pays: string;
  ville: string;
  region?: string;
  quartier?: string;
  latitude?: number;
  longitude?: number;
  estVillage?: boolean;
}

/** Numeric internal id behind a `Location`'s uuid — needed wherever a
 * mutation body wants `lieuId` (always numeric), mirrors
 * `people.ts::resolvePersonneNumericId`. */
const numericIdByUuid = new Map<string, number>();
export async function resolveLieuNumericId(uuid: string): Promise<number | undefined> {
  const cached = numericIdByUuid.get(uuid);
  if (cached !== undefined) return cached;
  try {
    const res = await apiRequest<LieuResponse>(`/lieux/${uuid}`);
    numericIdByUuid.set(uuid, res.lieu.id);
    return res.lieu.id;
  } catch {
    return undefined;
  }
}

/** Creates a new lieu on the fly (search-then-create pattern, mirrors
 * `PersonPicker`'s "nouveau" mode for people) — used when the place someone
 * wants to record isn't in the référentiel yet. */
export async function creerLieuReel(input: LieuInput): Promise<{ location: Location; numericId: number }> {
  const res = await apiRequest<LieuResponse>("/lieux", { method: "POST", body: input });
  numericIdByUuid.set(res.lieu.uuid, res.lieu.id);
  notifyDataChanged("lieu", res.lieu.uuid);
  return { location: toLocation(res.lieu), numericId: res.lieu.id };
}
