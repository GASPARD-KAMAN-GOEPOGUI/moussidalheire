import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { Lieu } from "@/models/lieu.model";

export class LieuRepository extends SoftDeletableRepository<
  Lieu,
  Prisma.LieuWhereUniqueInput,
  Prisma.LieuWhereInput,
  Prisma.LieuUncheckedCreateInput,
  Prisma.LieuUncheckedUpdateInput,
  Prisma.LieuOrderByWithRelationInput
> {
  constructor() {
    super(prisma.lieu);
  }
}

export const lieuRepository = new LieuRepository();
