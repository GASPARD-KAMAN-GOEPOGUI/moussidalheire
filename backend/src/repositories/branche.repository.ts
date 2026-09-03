import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { Branche } from "@/models/branche.model";

export class BrancheRepository extends SoftDeletableRepository<
  Branche,
  Prisma.BrancheWhereUniqueInput,
  Prisma.BrancheWhereInput,
  Prisma.BrancheUncheckedCreateInput,
  Prisma.BrancheUncheckedUpdateInput,
  Prisma.BrancheOrderByWithRelationInput
> {
  constructor() {
    super(prisma.branche);
  }
}

export const brancheRepository = new BrancheRepository();
