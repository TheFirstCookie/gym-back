import type { AdminVariant, ProductVariant, VariantRow } from "./variants.types.js";

export function toVariant(row: VariantRow): ProductVariant {
  return { id: row.id, name: row.name, priceCents: row.price_cents, stock: row.stock };
}

export function toAdminVariant(row: VariantRow): AdminVariant {
  return { ...toVariant(row), isActive: row.is_active };
}

/** What a product card needs to know about a product's variants. */
export function summarizeVariants(rows: VariantRow[], ownPriceCents: number) {
  const prices = rows.filter((row) => row.is_active).map((row) => row.price_cents);
  return {
    // Hidden ones count too: such a product can only be bought through a variant.
    hasVariants: rows.length > 0,
    // The product's own price is already the lowest active variant price (a trigger keeps it so).
    priceMaxCents: prices.length > 0 ? Math.max(...prices) : ownPriceCents,
  };
}
