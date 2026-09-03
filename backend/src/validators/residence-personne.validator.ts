import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema } from "./common.validator";

export const createResidencePersonneSchema = z
  .object({
    personneId: z.coerce.number().int().positive(),
    lieuId: z.coerce.number().int().positive(),
    anneeDebut: z.coerce.number().int().min(1800).max(2200).optional(),
    anneeFin: z.coerce.number().int().min(1800).max(2200).optional(),
    estActuelle: z.boolean().optional(),
  })
  .strict();
export type CreateResidencePersonneInput = z.infer<typeof createResidencePersonneSchema>;

export const updateResidencePersonneSchema = createResidencePersonneSchema;
export type UpdateResidencePersonneInput = z.infer<typeof updateResidencePersonneSchema>;

export const listResidencePersonneQuerySchema = paginationQuerySchema.extend({
  personneId: z.coerce.number().int().positive().optional(),
  lieuId: z.coerce.number().int().positive().optional(),
  estActuelle: booleanQueryParamSchema,
  inclureSupprimes: booleanQueryParamSchema,
});
export type ListResidencePersonneQuery = z.infer<typeof listResidencePersonneQuerySchema>;
