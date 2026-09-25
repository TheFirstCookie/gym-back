import { supabase } from "../../lib/supabase.js";
import type { Database } from "../../types/database.js";
import { withClientErrors } from "../../utils/db-errors.js";
import type { AdminBrand, AdminBrandRow } from "./admin-brands.types.js";

type BrandInsertRow = Database["public"]["Tables"]["brands"]["Insert"];
type BrandUpdateRow = Database["public"]["Tables"]["brands"]["Update"];

const WRITE_ERRORS = { unique: "Another brand already uses this slug" };

function toAdminBrand(row: AdminBrandRow): AdminBrand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    productCount: row.product_count,
    activeProductCount: row.active_product_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const adminBrandsRepository = {
  /** All brands A to Z, with product counts. */
  async findAll(): Promise<AdminBrand[]> {
    const { data } = await supabase.rpc("admin_brands").throwOnError();
    return data.map(toAdminBrand);
  },

  // A shop has a few dozen brands at most, so this reuses the list query.
  async findById(id: string): Promise<AdminBrand | null> {
    const all = await adminBrandsRepository.findAll();
    return all.find((brand) => brand.id === id) ?? null;
  },

  async insert(row: BrandInsertRow): Promise<string> {
    const { data } = await withClientErrors(
      supabase.from("brands").insert(row).select("id").single().throwOnError(),
      WRITE_ERRORS,
    );
    return data.id;
  },

  /** Returns false when no brand has this id. */
  async update(id: string, patch: BrandUpdateRow): Promise<boolean> {
    const { data } = await withClientErrors(
      supabase.from("brands").update(patch).eq("id", id).select("id").maybeSingle().throwOnError(),
      WRITE_ERRORS,
    );
    return data !== null;
  },

  /** Returns false when no brand has this id. Products block the delete (FK restrict). */
  async delete(id: string): Promise<boolean> {
    const { data } = await supabase.from("brands").delete().eq("id", id).select("id").maybeSingle().throwOnError();
    return data !== null;
  },
};
