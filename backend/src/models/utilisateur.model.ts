import type { Utilisateur } from "@prisma/client";

/**
 * The `Utilisateur` model — re-exported from Prisma's generated client, not
 * redefined here. The single source of truth for its fields/constraints/
 * indexes is the `Utilisateur` block in `prisma/schema.prisma`; that one
 * Prisma model already generates both the MySQL `utilisateurs` table (via
 * migrations) and this TypeScript type, so duplicating either by hand here
 * would create a second definition that could drift from the real one.
 *
 * This file exists so the model is importable from a conventional `src/models/`
 * path, alongside every other layer (controllers/services/repositories/...)
 * that also lives under `src/` — every part of the app should import the
 * `Utilisateur` type from here, not from `@prisma/client` directly.
 *
 * Deliberately NOT re-exported here: the Prisma delegate (`prisma.utilisateur`,
 * the `.findMany()`/`.create()`/... methods). Only `src/repositories/
 * utilisateurs.repository.ts` is allowed to call into Prisma — re-exporting the
 * delegate from a `models/` file that every layer imports would open a second,
 * untracked path into the database and break that rule.
 */
export type { Utilisateur };
