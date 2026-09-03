import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { CategorieActualite } from "@/models/categorie-actualite.model";

export class CategorieActualiteRepository extends SoftDeletableRepository<
  CategorieActualite,
  Prisma.CategorieActualiteWhereUniqueInput,
  Prisma.CategorieActualiteWhereInput,
  Prisma.CategorieActualiteUncheckedCreateInput,
  Prisma.CategorieActualiteUncheckedUpdateInput,
  Prisma.CategorieActualiteOrderByWithRelationInput
> {
  constructor() {
    super(prisma.categorieActualite);
  }
}

export const categorieActualiteRepository = new CategorieActualiteRepository();
