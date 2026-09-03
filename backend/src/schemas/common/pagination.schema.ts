import { z } from "zod";

/**
 * Generic, non-business schema — demonstrates the Zod validation system (used by
 * `validate()` in middlewares/validate.middleware.ts) end to end before any real
 * module (people/, families/, ...) exists. Business schemas live in their own
 * subfolder alongside this one; see the placeholders next to this file.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
