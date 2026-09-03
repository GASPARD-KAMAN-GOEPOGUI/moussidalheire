/**
 * Reusable pagination infrastructure — turns a validated `{ page, pageSize }`
 * query into the `skip`/`take` a Prisma `findMany` needs, and turns a total
 * row count into the `{ page, pageSize, total, totalPages }` metadata every
 * list endpoint returns. No module-specific query logic here — see
 * `schemas/common/pagination.schema.ts` for the input side (page/pageSize
 * validation, capped at 100 per request).
 */

export interface PaginationInput {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toSkipTake({ page, pageSize }: PaginationInput): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPaginationMeta(
  { page, pageSize }: PaginationInput,
  total: number,
): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
