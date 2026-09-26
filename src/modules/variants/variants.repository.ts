import { supabase } from "../../lib/supabase.js";
import { withClientErrors } from "../../utils/db-errors.js";
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

  /**
   * Replaces a product's variants with this list, in this order, in one transaction
   * (admin_save_variants, migration 0010). The product's price and stock follow.
   */
  async save(productId: string, variants: VariantWrite[]): Promise<void> {
    const payload = variants.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      name: variant.name,
      price_cents: variant.priceCents,
      stock: variant.stock,
      is_active: variant.isActive,
    }));

    await withClientErrors(
      supabase.rpc("admin_save_variants", { p_product_id: productId, p_variants: payload }).throwOnError(),
      {
        unique: "Two variants of this product can't have the same name",
        foreignKey: "Product not found",
      },
    );
  },
};
