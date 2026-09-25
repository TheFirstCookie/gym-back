import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.js";
import { slugSchema } from "../../utils/schemas.js";

export const reviewProductParamsSchema = z.object({
  slug: slugSchema,
});

export const reviewListQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

/** Optional short text where "" from a cleared form field means "none". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

export const upsertReviewSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  title: optionalText(120),
  body: z.string().trim().max(2000).default(""),
});

export const adminReviewListQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ReviewProductParams = z.infer<typeof reviewProductParamsSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;
