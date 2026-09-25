import { toProduct } from "../products/products.mapper.js";
import type { ProductListingRow } from "../products/products.types.js";
import type { CreateProductInput, UpdateProductInput } from "./admin-products.schema.js";
import type { AdminProduct, ProductInsertRow, ProductUpdateRow } from "./admin-products.types.js";

export function toAdminProduct(row: ProductListingRow): AdminProduct {
  return {
    ...toProduct(row),
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// API field -> database column, for every field an admin can write.
const COLUMN_BY_FIELD = {
  name: "name",
  slug: "slug",
  categoryId: "category_id",
  brandId: "brand_id",
  priceCents: "price_cents",
  currency: "currency",
  stock: "stock",
  tag: "tag",
  imageUrl: "image_url",
  description: "description",
  specs: "specs",
  sortOrder: "sort_order",
  isActive: "is_active",
} as const satisfies Record<keyof UpdateProductInput, keyof ProductUpdateRow>;

/** Converts only the fields that were sent, so a PATCH never overwrites the rest. */
export function toUpdateRow(patch: UpdateProductInput): ProductUpdateRow {
  const row: Record<string, unknown> = {};

  for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
    const value = patch[field as keyof UpdateProductInput];
    if (value !== undefined) row[column] = value;
  }

  return row as ProductUpdateRow;
}

export function toInsertRow(input: CreateProductInput & { slug: string }): ProductInsertRow {
  return toUpdateRow(input) as ProductInsertRow;
}
