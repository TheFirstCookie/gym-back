import { z } from "zod";

/** URL slug as stored in the database: lowercase words joined by single hyphens. */
export const slugSchema = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase, hyphen-separated slug");

/** A route `:id` parameter holding a database UUID. */
export const idParamsSchema = z.object({
  id: z.uuid(),
});

export type IdParams = z.infer<typeof idParamsSchema>;

/**
 * A query parameter that may repeat (`?brand=a&brand=b`) or be absent.
 * Always yields an array so handlers don't branch on string vs string[].
 */
export function repeatedQueryParam(item: z.ZodType<string>, maxItems = 20) {
  return z
    .union([item, z.array(item)])
    .optional()
    .transform((value): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
    .refine((values) => values.length <= maxItems, `At most ${maxItems} values`);
}

/** Free-text search: trimmed, capped, and empty strings treated as "no search". */
export const searchQuerySchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((value) => (value ? value : undefined));
