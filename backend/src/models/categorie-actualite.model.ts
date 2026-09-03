import type { CategorieActualite } from "@prisma/client";

/**
 * The `CategorieActualite` model — re-exported from Prisma's generated
 * client. Single source of truth: the `CategorieActualite` block in
 * `prisma/schema.prisma`.
 *
 * Referenced by `Actualite.categorieId` — a member with the admin role can
 * create new categories from the frontend (see `AddNewsCategoryDialog`);
 * every other member can list and use them when publishing an actualité.
 *
 * Every layer should import `CategorieActualite` from here, not from
 * `@prisma/client` directly. The Prisma delegate is deliberately NOT
 * re-exported here.
 */
export type { CategorieActualite };
