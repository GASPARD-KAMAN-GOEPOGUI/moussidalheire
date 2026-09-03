import type { Prisma } from "@prisma/client";
import { actualiteRepository } from "@/repositories/actualite.repository";
import { categorieActualiteRepository } from "@/repositories/categorie-actualite.repository";
import { familleRepository } from "@/repositories/famille.repository";
import type { Actualite } from "@/models/actualite.model";
import type {
  CreateActualiteInput,
  ListActualiteQuery,
  UpdateActualiteInput,
} from "@/validators/actualite.validator";
import { AppError } from "@/utils/app-error";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";

/** Thin pass-through to `ActualiteRepository` — no business rules yet, hormis
 * la vérification d'existence de `categorieId` (voir `verifierCategorieExiste`)
 * et l'enrichissement uuid (voir `enrichirAvecUuids`, même pattern que
 * `personne.service.ts`). */

async function verifierCategorieExiste(categorieId: number): Promise<void> {
  const categorie = await categorieActualiteRepository.findOne({
    id: categorieId,
    deletedAt: null,
  });
  if (!categorie) {
    throw AppError.notFound("Catégorie d'actualité introuvable.", { field: "categorieId" });
  }
}

export interface ActualiteAvecUuids extends Actualite {
  categorieUuid: string;
  categorieNom: string;
  categorieSlug: string;
  familleUuid?: string;
}

/**
 * Adds `categorieUuid`/`categorieNom`/`categorieSlug` alongside the existing
 * numeric `categorieId`, and `familleUuid` alongside `familleId` when set —
 * the frontend identifies every resource by uuid, but `Actualite`'s own FK
 * columns are internal numeric ids. Bounded to at most 2 extra queries total
 * (one batched `IN (...)` lookup each for categories/familles), regardless of
 * how many actualités are being enriched — never one query per row.
 */
export async function enrichirAvecUuids(actualites: Actualite[]): Promise<ActualiteAvecUuids[]> {
  const idsCategories = new Set<number>();
  const idsFamilles = new Set<number>();
  for (const a of actualites) {
    idsCategories.add(a.categorieId);
    if (a.familleId !== null) idsFamilles.add(a.familleId);
  }

  const [categories, familles] = await Promise.all([
    categorieActualiteRepository.findAll({ where: { id: { in: [...idsCategories] } } }),
    idsFamilles.size > 0
      ? familleRepository.findAll({ where: { id: { in: [...idsFamilles] } } })
      : Promise.resolve([]),
  ]);
  const categorieParId = new Map(categories.map((c) => [c.id, c]));
  const uuidParFamilleId = new Map(familles.map((f) => [f.id, f.uuid]));

  return actualites.map((a) => {
    const categorie = categorieParId.get(a.categorieId);
    return {
      ...a,
      categorieUuid: categorie?.uuid ?? "",
      categorieNom: categorie?.nom ?? "",
      categorieSlug: categorie?.slug ?? "",
      ...(a.familleId !== null && uuidParFamilleId.has(a.familleId)
        ? { familleUuid: uuidParFamilleId.get(a.familleId)! }
        : {}),
    };
  });
}

async function enrichirUneAvecUuids(actualite: Actualite): Promise<ActualiteAvecUuids> {
  const [enrichie] = await enrichirAvecUuids([actualite]);
  return enrichie!;
}

export async function lister(
  query: ListActualiteQuery,
): Promise<{ actualites: ActualiteAvecUuids[]; pagination: PaginationMeta }> {
  const where: Prisma.ActualiteWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.categorieId !== undefined ? { categorieId: query.categorieId } : {}),
    ...(query.familleId !== undefined ? { familleId: query.familleId } : {}),
    ...(query.miseEnAvant !== undefined ? { miseEnAvant: query.miseEnAvant } : {}),
    ...(query.recherche ? { titre: { contains: query.recherche } } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [actualites, total] = await Promise.all([
    actualiteRepository.findAll({ where, skip, take, orderBy: { datePublication: "desc" } }),
    actualiteRepository.count(where),
  ]);
  return { actualites: await enrichirAvecUuids(actualites), pagination: buildPaginationMeta(query, total) };
}

export async function obtenirParUuid(uuid: string): Promise<ActualiteAvecUuids> {
  const actualite = await actualiteRepository.findOne({ uuid });
  if (!actualite) {
    throw AppError.notFound("Actualité introuvable.");
  }
  return enrichirUneAvecUuids(actualite);
}

// See personne.service.ts for why this cast is needed.
export async function creer(input: CreateActualiteInput): Promise<ActualiteAvecUuids> {
  await verifierCategorieExiste(input.categorieId);
  const actualite = await actualiteRepository.create(input as Prisma.ActualiteUncheckedCreateInput);
  return enrichirUneAvecUuids(actualite);
}

export async function modifier(
  uuid: string,
  input: UpdateActualiteInput,
): Promise<ActualiteAvecUuids> {
  const existante = await obtenirParUuid(uuid);
  await verifierCategorieExiste(input.categorieId);
  const actualite = await actualiteRepository.update(
    { id: existante.id },
    input as Prisma.ActualiteUncheckedUpdateInput,
  );
  return enrichirUneAvecUuids(actualite);
}

export async function desactiver(uuid: string): Promise<ActualiteAvecUuids> {
  const existante = await obtenirParUuid(uuid);
  const actualite = await actualiteRepository.softDelete({ id: existante.id });
  return enrichirUneAvecUuids(actualite);
}

export async function restaurer(uuid: string): Promise<ActualiteAvecUuids> {
  const existante = await obtenirParUuid(uuid);
  const actualite = await actualiteRepository.restore({ id: existante.id });
  return enrichirUneAvecUuids(actualite);
}
