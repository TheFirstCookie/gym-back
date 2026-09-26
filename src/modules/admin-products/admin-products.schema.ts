import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.js";
import { repeatedQueryParam, searchQuerySchema, slugSchema } from "../../utils/schemas.js";
import { productSortSchema } from "../products/products.schema.js";

/** Optional short text where "" from a cleared form field means "none". */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

// Shared field rules. No defaults here: PATCH must leave unsent fields untouched,
// so defaults are added only in the create schema.
const productFields = {
  name: z.string().trim().min(1).max(160),
  slug: slugSchema,
  categoryId: z.uuid(),
  brandId: z.uuid(),
  /** Price in cents: 2999 means $29.99. */
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[a-z]{3}$/, "Must be a lowercase ISO currency code, e.g. usd"),
  stock: z.number().int().min(0).max(1_000_000),
  tag: nullableText(30),
  imageUrl: z.url({ protocol: /^https$/ }).nullable(),
  description: z.string().trim().max(2000),
  specs: z.array(z.string().trim().min(1).max(120)).max(12),
  sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
  isActive: z.boolean(),
};

export const createProductSchema = z.strictObject({
  ...productFields,
  // Derived from the name when omitted.
  slug: productFields.slug.optional(),
  currency: productFields.currency.default("usd"),
  stock: productFields.stock.default(0),
  tag: productFields.tag.default(null),
  imageUrl: productFields.imageUrl.default(null),
  description: productFields.description.default(""),
  specs: productFields.specs.default([]),
  sortOrder: productFields.sortOrder.default(0),
  isActive: productFields.isActive.default(true),
});

export const updateProductSchema = z
  .strictObject(productFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to update");

/** Enough for every plate weight or shirt size; more would be a separate product. */
export const MAX_VARIANTS = 30;

const variantSchema = z.strictObject({
  /** Omitted for a new variant. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  priceCents: productFields.priceCents,
  stock: productFields.stock,
  isActive: z.boolean().default(true),
});

/**
 * PUT /admin/products/:id/variants: the product's full list of variants, in display order.
 * Variants missing from the list are deleted; an empty list makes it a plain product again.
 */
export const saveVariantsSchema = z.strictObject({
  variants: z
    .array(variantSchema)
    .max(MAX_VARIANTS, `At most ${MAX_VARIANTS} variants per product`)
    .superRefine((variants, ctx) => {
      const names = new Set<string>();
      const ids = new Set<string>();
      variants.forEach((variant, index) => {
        const name = variant.name.toLowerCase();
        if (names.has(name)) {
          ctx.addIssue({ code: "custom", path: [index, "name"], message: `"${variant.name}" is listed twice` });
        }
        if (variant.id && ids.has(variant.id)) {
          ctx.addIssue({ code: "custom", path: [index, "id"], message: "The same variant is listed twice" });
        }
        names.add(name);
        if (variant.id) ids.add(variant.id);
      });
    }),
});

export const adminProductListQuerySchema = paginationQuerySchema.extend({
  category: slugSchema.optional(),
  brand: repeatedQueryParam(slugSchema),
  q: searchQuerySchema,
  sort: productSortSchema,
  status: z.enum(["active", "inactive", "all"]).default("all"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;
export type SaveVariantsInput = z.infer<typeof saveVariantsSchema>;
