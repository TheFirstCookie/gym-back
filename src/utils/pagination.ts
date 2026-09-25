import { z } from "zod";

export const MAX_PAGE_SIZE = 100;

/** `?page=2&pageSize=24`, coerced from query strings with sensible defaults. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(24),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function toLimitOffset({ page, pageSize }: PaginationQuery) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function toPagination({ page, pageSize }: PaginationQuery, total: number): Pagination {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
