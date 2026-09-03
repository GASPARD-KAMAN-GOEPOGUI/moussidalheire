import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema, statutUnionSchema } from "./common.validator";

export const createUnionSchema = z
  .object({
    epouxId: z.coerce.number().int().positive(),
    epouseId: z.coerce.number().int().positive(),
    statut: statutUnionSchema,
    dateDebut: z.coerce.date().optional(),
    dateFin: z.coerce.date().optional(),
  })
  .strict();
export type CreateUnionInput = z.infer<typeof createUnionSchema>;

export const updateUnionSchema = createUnionSchema;
export type UpdateUnionInput = z.infer<typeof updateUnionSchema>;

export const listUnionQuerySchema = paginationQuerySchema.extend({
  personneId: z.coerce.number().int().positive().optional(),
  statut: statutUnionSchema.optional(),
  inclureSupprimes: booleanQueryParamSchema,
});
export type ListUnionQuery = z.infer<typeof listUnionQuerySchema>;
