import type { Product, ProductListingRow, ProductSummary } from "./products.types.js";

// Row (snake_case, flat) -> API (camelCase, nested) conversions shared by the public and
// admin product modules, so both always describe a product the same way.

export function toProductSummary(row: ProductListingRow): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    priceCents: row.price_cents,
    currency: row.currency,
    stock: row.stock,
    tag: row.tag,
    image: row.image_url,
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
    brand: { id: row.brand_id, name: row.brand_name, slug: row.brand_slug },
  };
}

export function toProduct(row: ProductListingRow): Product {
  return {
    ...toProductSummary(row),
    description: row.description,
    specs: row.specs,
  };
}
