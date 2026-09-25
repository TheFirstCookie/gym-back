import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.js";
import { repeatedQueryParam, searchQuerySchema, slugSchema } from "../../utils/schemas.js";

export const productSortSchema = z.enum(["featured", "price-asc", "price-desc", "newest"]).default("featured");

/** GET /products?category=strength&brand=ironline&brand=groundwork&q=bell&sort=price-asc&page=1 */
export const productListQuerySchema = paginationQuerySchema.extend({
  category: slugSchema.optional(),
  brand: repeatedQueryParam(slugSchema),
  q: searchQuerySchema,
  sort: productSortSchema,
});

export const productParamsSchema = z.object({
  slug: slugSchema,
});

export const relatedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(3),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductParams = z.infer<typeof productParamsSchema>;
export type RelatedQuery = z.infer<typeof relatedQuerySchema>;
