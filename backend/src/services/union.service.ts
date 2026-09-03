import type { Prisma } from "@prisma/client";
import { unionRepository } from "@/repositories/union.repository";
import type { Union } from "@/models/union.model";
import type {
  CreateUnionInput,
  ListUnionQuery,
  UpdateUnionInput,
} from "@/validators/union.validator";
import { AppError } from "@/utils/app-error";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";
import { verifierPersonneExiste } from "@/services/personne.service";

/** Thin pass-through to `UnionRepository` — the business rules enforced here
 * are `epouxId !== epouseId` and that both personnes are real, active
 * fiches (see `creer`/`modifier` below) — same `verifierPersonneExiste` guard
 * `auth.service.ts` already uses for fratrie/conjoint entries, so a union
 * can never dangle off a deleted or non-existent personne. */

const SAME_PERSON_ERROR_MESSAGE = "Une union ne peut pas relier une personne à elle-même.";

export async function lister(
  query: ListUnionQuery,
): Promise<{ unions: Union[]; pagination: PaginationMeta }> {
  const where: Prisma.UnionWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.statut ? { statut: query.statut } : {}),
    ...(query.personneId !== undefined
      ? { OR: [{ epouxId: query.personneId }, { epouseId: query.personneId }] }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [unions, total] = await Promise.all([
    unionRepository.findAll({ where, skip, take, orderBy: { createdAt: "desc" } }),
    unionRepository.count(where),
  ]);
  return { unions, pagination: buildPaginationMeta(query, total) };
}

export async function obtenirParUuid(uuid: string): Promise<Union> {
  const union = await unionRepository.findOne({ uuid });
  if (!union) {
    throw AppError.notFound("Union introuvable.");
  }
  return union;
}

// See personne.service.ts for why this cast is needed.
export async function creer(input: CreateUnionInput): Promise<Union> {
  if (input.epouxId === input.epouseId) {
    throw AppError.conflict(SAME_PERSON_ERROR_MESSAGE, { field: "epouseId" });
  }
  await verifierPersonneExiste(input.epouxId, "epouxId");
  await verifierPersonneExiste(input.epouseId, "epouseId");
  return unionRepository.create(input as Prisma.UnionUncheckedCreateInput);
}

export async function modifier(uuid: string, input: UpdateUnionInput): Promise<Union> {
  if (input.epouxId === input.epouseId) {
    throw AppError.conflict(SAME_PERSON_ERROR_MESSAGE, { field: "epouseId" });
  }
  await verifierPersonneExiste(input.epouxId, "epouxId");
  await verifierPersonneExiste(input.epouseId, "epouseId");
  const existante = await obtenirParUuid(uuid);
  return unionRepository.update({ id: existante.id }, input as Prisma.UnionUncheckedUpdateInput);
}

export async function desactiver(uuid: string): Promise<Union> {
  const existante = await obtenirParUuid(uuid);
  return unionRepository.softDelete({ id: existante.id });
}

export async function restaurer(uuid: string): Promise<Union> {
  const existante = await obtenirParUuid(uuid);
  return unionRepository.restore({ id: existante.id });
}
