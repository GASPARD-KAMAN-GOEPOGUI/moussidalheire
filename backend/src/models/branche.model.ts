import type { Branche } from "@prisma/client";

/**
 * The `Branche` model — re-exported from Prisma's generated client. Single
 * source of truth: the `Branche` block in `prisma/schema.prisma`.
 *
 * 🟡 This table's exact purpose/rules are still "à décider" per the current
 * design brief — only its minimal, explicitly-requested shape is modeled
 * here (`familleId` → `Famille.id`; `Personne.brancheId` → `Branche.id`).
 * `statut`'s meaning is unspecified, so it's a free-text column, not an enum.
 *
 * Every layer should import `Branche` from here, not from `@prisma/client`
 * directly. The Prisma delegate is deliberately NOT re-exported here.
 */
export type { Branche };
