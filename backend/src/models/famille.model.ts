import type { Famille } from "@prisma/client";

/**
 * The `Famille` model — re-exported from Prisma's generated client. Single
 * source of truth: the `Famille` block in `prisma/schema.prisma`.
 *
 * `ancetreId` (nullable + unique) references `Personne.id`, which itself
 * references `Famille.id` via `Personne.familleId` — a deliberate circular
 * relationship between the two tables. Nullable lets either side be created
 * first without ever violating a NOT NULL constraint; unique guarantees a
 * person founds at most one family.
 *
 * Every layer should import `Famille` from here, not from `@prisma/client`
 * directly. The Prisma delegate is deliberately NOT re-exported here.
 */
export type { Famille };
