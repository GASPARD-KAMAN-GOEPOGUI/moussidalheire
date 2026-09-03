import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema } from "./common.validator";

/** 🟡 `branche` is still "à décider" per the design brief — `statut` stays a
 * free string (no enum invented) until its meaning is settled. */
export const createBrancheSchema = z
  .object({
    familleId: z.coerce.number().int().positive(),
    nom: z.string().trim().min(1).max(150),
    description: z.string().trim().optional(),
    statut: z.string().trim().max(50).optional(),
  })
  .strict();
export type CreateBrancheInput = z.infer<typeof createBrancheSchema>;

export const updateBrancheSchema = createBrancheSchema;
export type UpdateBrancheInput = z.infer<typeof updateBrancheSchema>;

export const listBrancheQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(1).max(100).optional(),
  familleId: z.coerce.number().int().positive().optional(),
  inclureSupprimes: booleanQueryParamSchema,
});
export type ListBrancheQuery = z.infer<typeof listBrancheQuerySchema>;
