import type { Union } from "@prisma/client";

/**
 * The `Union` model — re-exported from Prisma's generated client. Single
 * source of truth: the `Union` block in `prisma/schema.prisma`.
 *
 * Relates exactly two people (`epouxId`, `epouseId`, both FKs to
 * `Personne.id`) — never more, never fewer. A person can appear in several
 * `Union` rows (successive unions, remarriage), which is how "a person can
 * have several spouses" is represented; `Personne` itself carries no
 * `spouseId`/`spouseIds`. Children of a union are not stored here either
 * (no `childrenIds`) — they're derived by matching `Personne.pereId`/`mereId`
 * against the union's two members.
 *
 * Every layer should import `Union` from here, not from `@prisma/client`
 * directly. The Prisma delegate is deliberately NOT re-exported here.
 */
export type { Union };
