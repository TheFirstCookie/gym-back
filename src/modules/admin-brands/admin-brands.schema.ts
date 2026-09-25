import { z } from "zod";
import { slugSchema } from "../../utils/schemas.js";

const brandFields = {
  name: z.string().trim().min(1).max(80),
  slug: slugSchema,
};

export const createBrandSchema = z.strictObject({
  ...brandFields,
  // Derived from the name when omitted.
  slug: brandFields.slug.optional(),
});

export const updateBrandSchema = z
  .strictObject(brandFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to update");

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
