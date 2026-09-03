import { z } from "zod";

/**
 * Shared field-level building blocks for every utilisateurs schema (create/update/
 * query) — kept in one place so a rule (e.g. identifiant format, password strength)
 * only ever changes in one spot.
 */

const IDENTIFIANT_REGEX = /^[a-zA-Z0-9._-]+$/;

export const identifiantSchema = z
  .string()
  .trim()
  .min(3, "L'identifiant doit contenir au moins 3 caractères.")
  .max(50, "L'identifiant ne peut pas dépasser 50 caractères.")
  .regex(
    IDENTIFIANT_REGEX,
    "L'identifiant ne peut contenir que des lettres, chiffres, points, tirets et underscores.",
  );

/**
 * Optional email: `undefined`/omitted and `""` are both treated as "not provided".
 * Capped at 191 to match `email @db.VarChar(191)` on the Prisma model (see that
 * field's doc comment for why 191, not 255) — rejected here with a clear
 * validation message instead of surfacing as an opaque database error later.
 */
export const optionalEmailSchema = z
  .union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("Adresse e-mail invalide."))])
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.string().max(191, "L'e-mail ne peut pas dépasser 191 caractères.").optional());

/**
 * Minimal strength rule: at least 8 characters, at least one letter and one digit.
 * Capped at 72 — bcrypt silently truncates/ignores bytes beyond 72, so anything
 * longer would create a false sense of a stronger password.
 */
export const motDePasseSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(72, "Le mot de passe ne peut pas dépasser 72 caractères.")
  .regex(/[a-zA-Z]/, "Le mot de passe doit contenir au moins une lettre.")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre.");

export const personneIdSchema = z.coerce
  .number("personneId doit être un nombre.")
  .int("personneId doit être un entier.")
  .positive("personneId doit être positif.");

/** Query-string booleans arrive as the strings "true"/"false" — z.coerce.boolean() is
 * a well-known footgun here (any non-empty string, including "false", coerces to true). */
export const booleanQueryParamSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export const uuidParamSchema = z.object({
  id: z.uuid("Identifiant utilisateur invalide."),
});

export type UuidParam = z.infer<typeof uuidParamSchema>;
