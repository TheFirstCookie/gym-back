import type { Json } from "../../types/database.js";
import type { VariantWrite } from "../variants/variants.repository.js";
import { supabase } from "../../lib/supabase.js";
import { withClientErrors } from "../../utils/db-errors.js";
import { LISTING_COLUMNS } from "../products/products.repository.js";
import type { ProductListingRow } from "../products/products.types.js";
import type { ProductUpdateRow } from "./admin-products.types.js";

const WRITE_ERRORS = {
  unique: "Another product already uses this slug",
  foreignKey: "The selected category or brand doesn't exist",
};

// Writes go to the products table; reads go through product_listings so every response
// carries the category and brand names alongside the ids.
export const adminProductsRepository = {
  async write(id: string | null, patch: ProductUpdateRow, variants?: VariantWrite[], expectedUpdatedAt?: string): Promise<string | null> {
    const { data } = await withClientErrors(supabase.rpc("admin_write_product", {
      p_id: id, p_patch: patch as Json,
      p_variants: variants === undefined ? null : variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}), name: v.name, price_cents: v.priceCents, stock: v.stock, is_active: v.isActive,
      })), p_expected_updated_at: expectedUpdatedAt ?? null,
    }).throwOnError(), WRITE_ERRORS);
    return data;
  },
  async findById(id: string): Promise<ProductListingRow | null> {
    const { data } = await supabase
      .from("product_listings")
      .select(LISTING_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .throwOnError();

    return data;
  },

  /** Returns false when no product has this id. */
  async update(id: string, patch: ProductUpdateRow): Promise<boolean> {
    const { data } = await withClientErrors(
      supabase.from("products").update(patch).eq("id", id).select("id").maybeSingle().throwOnError(),
      WRITE_ERRORS,
    );
    return data !== null;
  },
};
