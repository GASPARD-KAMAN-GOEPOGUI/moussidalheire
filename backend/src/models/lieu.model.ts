import type { Lieu } from "@prisma/client";

/**
 * The `Lieu` model — re-exported from Prisma's generated client. Single
 * source of truth: the `Lieu` block in `prisma/schema.prisma`.
 *
 * A reference table of places (village quarters, cities, countries),
 * reusable across many people via `ResidencePersonne` — a place's
 * name/coordinates are never duplicated onto a residence record.
 *
 * Every layer should import `Lieu` from here, not from `@prisma/client`
 * directly. The Prisma delegate is deliberately NOT re-exported here.
 */
export type { Lieu };
