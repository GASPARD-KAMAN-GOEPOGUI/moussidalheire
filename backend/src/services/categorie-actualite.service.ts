import type { Prisma } from "@prisma/client";
import { categorieActualiteRepository } from "@/repositories/categorie-actualite.repository";
import type { CategorieActualite } from "@/models/categorie-actualite.model";
import type {
  CreateCategorieActualiteInput,
  ListCategorieActualiteQuery,
  UpdateCategorieActualiteInput,
} from "@/validators/categorie-actualite.validator";
import { AppError } from "@/utils/app-error";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";

/** Thin pass-through to `CategorieActualiteRepository` — no business rules
 * yet. Referenced by `Actualite.categorieId` (see the model's doc comment). */

export async function lister(
  query: ListCategorieActualiteQuery,
): Promise<{ categories: CategorieActualite[]; pagination: PaginationMeta }> {
  const where: Prisma.CategorieActualiteWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.recherche ? { nom: { contains: query.recherche } } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [categories, total] = await Promise.all([
    categorieActualiteRepository.findAll({ where, skip, take, orderBy: { createdAt: "desc" } }),
    categorieActualiteRepository.count(where),
  ]);
  return { categories, pagination: buildPaginationMeta(query, total) };
}

export async function obtenirParUuid(uuid: string): Promise<CategorieActualite> {
  const categorie = await categorieActualiteRepository.findOne({ uuid });
  if (!categorie) {
    throw AppError.notFound("Catégorie d'actualité introuvable.");
  }
  return categorie;
}

// See personne.service.ts for why this cast is needed.
export function creer(input: CreateCategorieActualiteInput): Promise<CategorieActualite> {
  return categorieActualiteRepository.create(
    input as Prisma.CategorieActualiteUncheckedCreateInput,
  );
}

export async function modifier(
  uuid: string,
  input: UpdateCategorieActualiteInput,
): Promise<CategorieActualite> {
  const existante = await obtenirParUuid(uuid);
  return categorieActualiteRepository.update(
    { id: existante.id },
    input as Prisma.CategorieActualiteUncheckedUpdateInput,
  );
}

export async function desactiver(uuid: string): Promise<CategorieActualite> {
  const existante = await obtenirParUuid(uuid);
  return categorieActualiteRepository.softDelete({ id: existante.id });
}

export async function restaurer(uuid: string): Promise<CategorieActualite> {
  const existante = await obtenirParUuid(uuid);
  return categorieActualiteRepository.restore({ id: existante.id });
}
