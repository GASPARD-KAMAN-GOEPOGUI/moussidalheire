import type { ResidencePersonne } from "@prisma/client";

/**
 * The `ResidencePersonne` model — re-exported from Prisma's generated client.
 * Single source of truth: the `ResidencePersonne` block in
 * `prisma/schema.prisma`.
 *
 * One row per residence period for a person (`personneId` → `Personne.id`,
 * `lieuId` → `Lieu.id`) — a person can have several, current or past
 * (`estActuelle`). Never duplicates the place's own data; only references it.
 *
 * Every layer should import `ResidencePersonne` from here, not from
 * `@prisma/client` directly. The Prisma delegate is deliberately NOT
 * re-exported here.
 */
export type { ResidencePersonne };
