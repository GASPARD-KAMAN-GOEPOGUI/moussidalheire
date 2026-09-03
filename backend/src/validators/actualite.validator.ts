import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema } from "./common.validator";

export const createActualiteSchema = z
  .object({
    titre: z.string().trim().min(1).max(200),
    categorieId: z.coerce.number().int().positive(),
    imageCouverture: z.string().trim().max(500).optional(),
    resume: z.string().trim().min(1),
    contenu: z.string().trim().min(1),
    auteur: z.string().trim().max(150).optional(),
    miseEnAvant: z.boolean().optional(),
    familleId: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type CreateActualiteInput = z.infer<typeof createActualiteSchema>;

export const updateActualiteSchema = createActualiteSchema;
export type UpdateActualiteInput = z.infer<typeof updateActualiteSchema>;

export const listActualiteQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(1).max(100).optional(),
  categorieId: z.coerce.number().int().positive().optional(),
  familleId: z.coerce.number().int().positive().optional(),
  miseEnAvant: booleanQueryParamSchema,
  inclureSupprimes: booleanQueryParamSchema,
});
export type ListActualiteQuery = z.infer<typeof listActualiteQuerySchema>;
