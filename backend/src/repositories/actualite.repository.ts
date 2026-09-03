import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { Actualite } from "@/models/actualite.model";

export class ActualiteRepository extends SoftDeletableRepository<
  Actualite,
  Prisma.ActualiteWhereUniqueInput,
  Prisma.ActualiteWhereInput,
  Prisma.ActualiteUncheckedCreateInput,
  Prisma.ActualiteUncheckedUpdateInput,
  Prisma.ActualiteOrderByWithRelationInput
> {
  constructor() {
    super(prisma.actualite);
  }
}

export const actualiteRepository = new ActualiteRepository();
