import { z } from "zod";

/**
 * Shared, cross-module Zod building blocks for the business-model validators
 * below (personne/famille/union/...). Enum schemas mirror the Prisma enums in
 * `prisma/schema.prisma` literally — one source of truth for the allowed
 * values, duplicated here only because Zod (input validation) and Prisma
 * (storage) are necessarily two different layers.
 */

export const idParamSchema = z.object({
  id: z.uuid("Identifiant invalide."),
});
export type IdParam = z.infer<typeof idParamSchema>;

/** Query-string booleans arrive as the strings "true"/"false" — z.coerce.boolean()
 * is a well-known footgun here (any non-empty string, including "false", coerces
 * to true). */
export const booleanQueryParamSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export const sexeSchema = z.enum(["homme", "femme"]);
export const statutMatrimonialSchema = z.enum(["celibataire", "marie", "divorce", "veuf"]);
export const statutUnionSchema = z.enum(["marie", "divorce", "veuf", "partenaire"]);
export const visibiliteSchema = z.enum(["public", "membres", "prive"]);
