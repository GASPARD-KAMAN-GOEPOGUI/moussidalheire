import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema } from "./utilisateur.primitives";

/**
 * GET /api/v1/utilisateurs — query string. Extends the shared pagination schema
 * (page/pageSize, capped at 100 so a single request can't force an unbounded table
 * scan/response) with utilisateurs-specific filters.
 */
export const listUtilisateursQuerySchema = paginationQuerySchema.extend({
  recherche: z.string().trim().min(1).max(100).optional(),
  actif: booleanQueryParamSchema,
  inclureSupprimes: booleanQueryParamSchema,
});

export type ListUtilisateursQuery = z.infer<typeof listUtilisateursQuerySchema>;
