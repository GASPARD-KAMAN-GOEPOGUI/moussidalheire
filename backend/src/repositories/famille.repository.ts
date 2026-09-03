import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { Famille } from "@/models/famille.model";

export class FamilleRepository extends SoftDeletableRepository<
  Famille,
  Prisma.FamilleWhereUniqueInput,
  Prisma.FamilleWhereInput,
  Prisma.FamilleUncheckedCreateInput,
  Prisma.FamilleUncheckedUpdateInput,
  Prisma.FamilleOrderByWithRelationInput
> {
  constructor() {
    super(prisma.famille);
  }

  /** Familles directement rattachées à celle-ci comme famille parente —
   * un niveau de la hiérarchie, jamais stocké ailleurs que sur
   * `familleParenteId`. */
  trouverRelatives(familleId: number): Promise<Famille[]> {
    return prisma.famille.findMany({
      where: { familleParenteId: familleId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Même chose que `trouverRelatives`, mais pour plusieurs familles parentes
   * à la fois — un seul aller-retour DB par niveau, utilisé par la descente
   * BFS de `resoudreUniversFamilial` (voir famille.service.ts). */
  trouverRelativesParLot(familleParenteIds: number[]): Promise<Famille[]> {
    if (familleParenteIds.length === 0) return Promise.resolve([]);
    return prisma.famille.findMany({
      where: { familleParenteId: { in: familleParenteIds } },
    });
  }
}

export const familleRepository = new FamilleRepository();

/**
 * The one write this repository exposes outside the `FamilleRepository`
 * class: creating a famille against a caller-supplied Prisma client instead
 * of the module-global `prisma` singleton. Used solely by
 * auth.service.ts::inscrire() to fonder une nouvelle famille fondatrice à
 * l'intérieur de la transaction d'auto-inscription, quand le père n'a pas de
 * famille réelle existante à désigner — le seul cas où une famille peut être
 * créée sans passer par `POST /familles` (réservée aux admins). Mirrors
 * `personne.repository.ts::creerAvecClient`.
 */
export function creerAvecClient(
  client: Prisma.TransactionClient,
  data: Prisma.FamilleUncheckedCreateInput,
): Promise<Famille> {
  return client.famille.create({ data });
}
