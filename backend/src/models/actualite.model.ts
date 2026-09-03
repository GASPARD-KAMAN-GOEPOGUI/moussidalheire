import type { Actualite } from "@prisma/client";

/**
 * The `Actualite` model — re-exported from Prisma's generated client. Single
 * source of truth: the `Actualite` block in `prisma/schema.prisma`.
 *
 * `categorieId` is a required FK to `CategorieActualite` (dynamic categories
 * — an admin can create new ones from the frontend). `familleId` is an
 * optional FK to `Famille`.
 *
 * Every layer should import `Actualite` from here, not from `@prisma/client`
 * directly. The Prisma delegate is deliberately NOT re-exported here.
 */
export type { Actualite };
