import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema } from "./common.validator";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Referenced by `Actualite.categorieId` (see the model's doc comment). */
export const createCategorieActualiteSchema = z
  .object({
    nom: z.string().trim().min(1).max(100),
    slug: z.string().trim().toLowerCase().min(1).max(100).regex(SLUG_REGEX, "Slug invalide."),
    description: z.string().trim().optional(),
    statut: z.string().trim().max(50).optional(),
  })
  .strict();
export type CreateCategorieActualiteInput = z.infer<typeof createCategorieActualiteSchema>;

export const updateCategorieActualiteSchema = createCategorieActualiteSchema;
export type UpdateCategorieActualiteInput = z.infer<typeof updateCategorieActualiteSchema>;

export const listCategorieActualiteQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(1).max(100).optional(),
  inclureSupprimes: booleanQueryParamSchema,
});
export type ListCategorieActualiteQuery = z.infer<typeof listCategorieActualiteQuerySchema>;
