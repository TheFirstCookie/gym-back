import { supabase } from "../../lib/supabase.js";
import { withClientErrors } from "../../utils/db-errors.js";
import { LISTING_COLUMNS } from "../products/products.repository.js";
import type { ProductListingRow } from "../products/products.types.js";
import type { ProductInsertRow, ProductUpdateRow } from "./admin-products.types.js";

const WRITE_ERRORS = {
  unique: "Another product already uses this slug",
  foreignKey: "The selected category or brand doesn't exist",
};

// Writes go to the products table; reads go through product_listings so every response
// carries the category and brand names alongside the ids.
export const adminProductsRepository = {
  async findById(id: string): Promise<ProductListingRow | null> {
    const { data } = await supabase
      .from("product_listings")
      .select(LISTING_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .throwOnError();

    return data;
  },

  async insert(row: ProductInsertRow): Promise<string> {
    const { data } = await withClientErrors(
      supabase.from("products").insert(row).select("id").single().throwOnError(),
      WRITE_ERRORS,
    );
    return data.id;
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
