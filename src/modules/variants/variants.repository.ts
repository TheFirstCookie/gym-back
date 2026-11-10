import { supabase } from "../../lib/supabase.js";
import type { VariantRow } from "./variants.types.js";

const VARIANT_COLUMNS = "id, product_id, name, price_cents, stock, is_active";

/** A variant as the admin saves it; rows without an id are new. */
export type VariantWrite = {
  id?: string;
  name: string;
  priceCents: number;
  stock: number;
  isActive: boolean;
};

export const variantsRepository = {
  /**
   * Every variant (hidden ones too) of the given products, in display order, grouped by
   * product id. Products without variants are absent from the map.
   */
  async listByProduct(productIds: string[]): Promise<Map<string, VariantRow[]>> {
    const byProduct = new Map<string, VariantRow[]>();
    if (productIds.length === 0) return byProduct;

    const { data } = await supabase
      .from("product_variants")
      .select(VARIANT_COLUMNS)
      .in("product_id", [...new Set(productIds)])
      .order("sort_order")
      .order("name")
      .throwOnError();

    for (const row of data) {
      const list = byProduct.get(row.product_id);
      if (list) list.push(row);
      else byProduct.set(row.product_id, [row]);
    }
    return byProduct;
  },

};
