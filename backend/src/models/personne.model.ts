import type { Personne } from "@prisma/client";

/**
 * The `Personne` model — re-exported from Prisma's generated client, not
 * redefined here. Single source of truth: the `Personne` block in
 * `prisma/schema.prisma`.
 *
 * No `childrenIds`/`siblingIds`/`spouseIds` exist on this type, deliberately:
 * - children are found via `pereId`/`mereId` pointing at this person's id
 *   (Prisma relations `enfantsCommePere`/`enfantsCommeMere` on the model),
 * - siblings are derived by querying people who share the same `pereId` or
 *   `mereId` — never stored,
 * - spouses are derived from `Union` (`epouxId`/`epouseId`), never
 *   stored on `Personne` itself.
 *
 * Every layer should import `Personne` from here, not from `@prisma/client`
 * directly. The Prisma delegate (`prisma.personne.*`) is deliberately NOT
 * re-exported — only `src/repositories/personne.repository.ts` is meant to call it.
 */
export type { Personne };
