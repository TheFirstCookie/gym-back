import { summarizeVariants, toVariant } from "../variants/variants.mapper.js";
import type { VariantRow } from "../variants/variants.types.js";
import type { Product, ProductListingRow, ProductSummary } from "./products.types.js";

// Row (snake_case, flat) -> API (camelCase, nested) conversions shared by the public and
// admin product modules, so both always describe a product the same way. `variants` are
// the product's variant rows (hidden ones included), or none for a plain product.

export function toProductSummary(row: ProductListingRow, variants: VariantRow[] = []): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    priceCents: row.price_cents,
    ...summarizeVariants(variants, row.price_cents),
    currency: row.currency,
    stock: row.stock,
    tag: row.tag,
    image: row.image_url,
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
    brand: { id: row.brand_id, name: row.brand_name, slug: row.brand_slug },
  };
}

export function toProduct(row: ProductListingRow, variants: VariantRow[] = []): Product {
  return {
    ...toProductSummary(row, variants),
    description: row.description,
    specs: row.specs,
    variants: variants.filter((variant) => variant.is_active).map(toVariant),
  };
}
