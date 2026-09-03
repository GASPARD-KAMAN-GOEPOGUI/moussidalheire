import type { Prisma } from "@prisma/client";
import { lieuRepository } from "@/repositories/lieu.repository";
import type { Lieu } from "@/models/lieu.model";
import type { CreateLieuInput, ListLieuQuery, UpdateLieuInput } from "@/validators/lieu.validator";
import { AppError } from "@/utils/app-error";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";

/** Thin pass-through to `LieuRepository` — no business rules yet. */

export async function lister(
  query: ListLieuQuery,
): Promise<{ lieux: Lieu[]; pagination: PaginationMeta }> {
  const where: Prisma.LieuWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.estVillage !== undefined ? { estVillage: query.estVillage } : {}),
    ...(query.recherche
      ? { OR: [{ ville: { contains: query.recherche } }, { pays: { contains: query.recherche } }] }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [lieux, total] = await Promise.all([
    lieuRepository.findAll({ where, skip, take, orderBy: { createdAt: "desc" } }),
    lieuRepository.count(where),
  ]);
  return { lieux, pagination: buildPaginationMeta(query, total) };
}

export async function obtenirParUuid(uuid: string): Promise<Lieu> {
  const lieu = await lieuRepository.findOne({ uuid });
  if (!lieu) {
    throw AppError.notFound("Lieu introuvable.");
  }
  return lieu;
}

/** Used by `residence-personne.service.ts` before attaching a `lieuId` to a
 * personne — mirrors `personne.service.ts::verifierFamilleExiste`. */
export async function verifierLieuExiste(lieuId: number): Promise<void> {
  const lieu = await lieuRepository.findOne({ id: lieuId, deletedAt: null });
  if (!lieu) {
    throw AppError.notFound("Lieu introuvable.", { field: "lieuId" });
  }
}

// See personne.service.ts for why this cast is needed.
export function creer(input: CreateLieuInput): Promise<Lieu> {
  return lieuRepository.create(input as Prisma.LieuUncheckedCreateInput);
}

export async function modifier(uuid: string, input: UpdateLieuInput): Promise<Lieu> {
  const existant = await obtenirParUuid(uuid);
  return lieuRepository.update({ id: existant.id }, input as Prisma.LieuUncheckedUpdateInput);
}

export async function desactiver(uuid: string): Promise<Lieu> {
  const existant = await obtenirParUuid(uuid);
  return lieuRepository.softDelete({ id: existant.id });
}

export async function restaurer(uuid: string): Promise<Lieu> {
  const existant = await obtenirParUuid(uuid);
  return lieuRepository.restore({ id: existant.id });
}
