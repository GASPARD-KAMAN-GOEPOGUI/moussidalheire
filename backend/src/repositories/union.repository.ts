import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { Union } from "@/models/union.model";

export class UnionRepository extends SoftDeletableRepository<
  Union,
  Prisma.UnionWhereUniqueInput,
  Prisma.UnionWhereInput,
  Prisma.UnionUncheckedCreateInput,
  Prisma.UnionUncheckedUpdateInput,
  Prisma.UnionOrderByWithRelationInput
> {
  constructor() {
    super(prisma.union);
  }
}

export const unionRepository = new UnionRepository();

/** The one write this repository exposes outside the module-global `prisma`
 * singleton — reserved for transactional flows that create a `Union`
 * alongside other entities in the same `prisma.$transaction` (see
 * auth.service.ts's self-registration flow, and personne.repository.ts /
 * utilisateurs.repository.ts for the same pattern). */
export function creerAvecClient(
  client: Prisma.TransactionClient,
  data: Prisma.UnionUncheckedCreateInput,
): Promise<Union> {
  return client.union.create({ data });
}

/** Looks up an existing union between two people (either order) inside the
 * transaction — used before creating one, so registering two people who
 * already have a recorded union together (e.g. père+mère both already in
 * base) never produces a duplicate row. */
export function trouverEntreAvecClient(
  client: Prisma.TransactionClient,
  aId: number,
  bId: number,
): Promise<Union | null> {
  return client.union.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { epouxId: aId, epouseId: bId },
        { epouxId: bId, epouseId: aId },
      ],
    },
  });
}
