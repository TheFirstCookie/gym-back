import { z } from "zod";
import { slugSchema } from "../../utils/schemas.js";

// No defaults on the shared fields: PATCH must leave unsent fields untouched.
const categoryFields = {
  name: z.string().trim().min(1).max(80),
  slug: slugSchema,
  /** Colour of the category's tile on the storefront. */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour like #ff6b1a"),
  /** Lower comes first in the storefront's category strip. */
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
};

export const createCategorySchema = z.strictObject({
  ...categoryFields,
  // Derived from the name when omitted.
  slug: categoryFields.slug.optional(),
  accent: categoryFields.accent.default("#ff6b1a"),
  sortOrder: categoryFields.sortOrder.default(0),
});

export const updateCategorySchema = z
  .strictObject(categoryFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to update");

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
