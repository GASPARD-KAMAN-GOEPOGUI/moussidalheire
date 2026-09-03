import type { Prisma } from "@prisma/client";
import { brancheRepository } from "@/repositories/branche.repository";
import { verifierFamilleExiste } from "@/services/personne.service";
import type { Branche } from "@/models/branche.model";
import type {
  CreateBrancheInput,
  ListBrancheQuery,
  UpdateBrancheInput,
} from "@/validators/branche.validator";
import { AppError } from "@/utils/app-error";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";

/** Thin pass-through to `BrancheRepository` — the only business rule is that
 * `familleId` must reference an existing famille (reuses
 * `personne.service.ts::verifierFamilleExiste` rather than duplicating it). */

export async function lister(
  query: ListBrancheQuery,
): Promise<{ branches: Branche[]; pagination: PaginationMeta }> {
  const where: Prisma.BrancheWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.familleId !== undefined ? { familleId: query.familleId } : {}),
    ...(query.recherche ? { nom: { contains: query.recherche } } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [branches, total] = await Promise.all([
    brancheRepository.findAll({ where, skip, take, orderBy: { createdAt: "desc" } }),
    brancheRepository.count(where),
  ]);
  return { branches, pagination: buildPaginationMeta(query, total) };
}

export async function obtenirParUuid(uuid: string): Promise<Branche> {
  const branche = await brancheRepository.findOne({ uuid });
  if (!branche) {
    throw AppError.notFound("Branche introuvable.");
  }
  return branche;
}

// See personne.service.ts for why this cast is needed.
export async function creer(input: CreateBrancheInput): Promise<Branche> {
  await verifierFamilleExiste(input.familleId);
  return brancheRepository.create(input as Prisma.BrancheUncheckedCreateInput);
}

export async function modifier(uuid: string, input: UpdateBrancheInput): Promise<Branche> {
  const existante = await obtenirParUuid(uuid);
  if (input.familleId !== existante.familleId) {
    await verifierFamilleExiste(input.familleId);
  }
  return brancheRepository.update(
    { id: existante.id },
    input as Prisma.BrancheUncheckedUpdateInput,
  );
}

export async function desactiver(uuid: string): Promise<Branche> {
  const existante = await obtenirParUuid(uuid);
  return brancheRepository.softDelete({ id: existante.id });
}

export async function restaurer(uuid: string): Promise<Branche> {
  const existante = await obtenirParUuid(uuid);
  return brancheRepository.restore({ id: existante.id });
}
