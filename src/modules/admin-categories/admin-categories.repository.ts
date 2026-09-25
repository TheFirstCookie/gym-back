import { supabase } from "../../lib/supabase.js";
import { withClientErrors } from "../../utils/db-errors.js";
import type {
  AdminCategory,
  AdminCategoryRow,
  CategoryInsertRow,
  CategoryUpdateRow,
} from "./admin-categories.types.js";

const WRITE_ERRORS = { unique: "Another category already uses this slug" };

function toAdminCategory(row: AdminCategoryRow): AdminCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    accent: row.accent_color,
    sortOrder: row.sort_order,
    productCount: row.product_count,
    activeProductCount: row.active_product_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const adminCategoriesRepository = {
  /** All categories in storefront order, with product counts. */
  async findAll(): Promise<AdminCategory[]> {
    const { data } = await supabase.rpc("admin_categories").throwOnError();
    return data.map(toAdminCategory);
  },

  // A shop has a handful of categories, so this reuses the list query.
  async findById(id: string): Promise<AdminCategory | null> {
    const all = await adminCategoriesRepository.findAll();
    return all.find((category) => category.id === id) ?? null;
  },

  async insert(row: CategoryInsertRow): Promise<string> {
    const { data } = await withClientErrors(
      supabase.from("categories").insert(row).select("id").single().throwOnError(),
      WRITE_ERRORS,
    );
    return data.id;
  },

  /** Returns false when no category has this id. */
  async update(id: string, patch: CategoryUpdateRow): Promise<boolean> {
    const { data } = await withClientErrors(
      supabase.from("categories").update(patch).eq("id", id).select("id").maybeSingle().throwOnError(),
      WRITE_ERRORS,
    );
    return data !== null;
  },

  /** Returns false when no category has this id. Products block the delete (FK restrict). */
  async delete(id: string): Promise<boolean> {
    const { data } = await supabase.from("categories").delete().eq("id", id).select("id").maybeSingle().throwOnError();
    return data !== null;
  },
};
