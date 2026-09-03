import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema } from "./common.validator";

export const createLieuSchema = z
  .object({
    pays: z.string().trim().min(1).max(100),
    region: z.string().trim().max(100).optional(),
    ville: z.string().trim().min(1).max(100),
    quartier: z.string().trim().max(100).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    estVillage: z.boolean().optional(),
  })
  .strict();
export type CreateLieuInput = z.infer<typeof createLieuSchema>;

export const updateLieuSchema = createLieuSchema;
export type UpdateLieuInput = z.infer<typeof updateLieuSchema>;

export const listLieuQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(1).max(100).optional(),
  estVillage: booleanQueryParamSchema,
  inclureSupprimes: booleanQueryParamSchema,
});
export type ListLieuQuery = z.infer<typeof listLieuQuerySchema>;
