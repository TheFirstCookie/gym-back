import type { Database } from "../../types/database.js";

export type VariantRow = Pick<
  Database["public"]["Tables"]["product_variants"]["Row"],
  "id" | "product_id" | "name" | "price_cents" | "stock" | "is_active"
>;

/**
 * One option of a product (a weight, size or colour) with its own price and stock.
 * Products with variants are bought through one of them; see migration 0010.
 */
export type ProductVariant = {
  id: string;
  name: string;
  /** Integer minor units, like the product's own price. */
  priceCents: number;
  stock: number;
};

/** The admin also sees (and edits) hidden variants. */
export type AdminVariant = ProductVariant & {
  isActive: boolean;
};
