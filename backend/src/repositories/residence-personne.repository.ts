import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { ResidencePersonne } from "@/models/residence-personne.model";

export class ResidencePersonneRepository extends SoftDeletableRepository<
  ResidencePersonne,
  Prisma.ResidencePersonneWhereUniqueInput,
  Prisma.ResidencePersonneWhereInput,
  Prisma.ResidencePersonneUncheckedCreateInput,
  Prisma.ResidencePersonneUncheckedUpdateInput,
  Prisma.ResidencePersonneOrderByWithRelationInput
> {
  constructor() {
    super(prisma.residencePersonne);
  }
}

export const residencePersonneRepository = new ResidencePersonneRepository();
