import { supabase } from "../../lib/supabase.js";
import type { Category, CategoryRow } from "./categories.types.js";

const COLUMNS = "id, name, slug, accent_color, product_count";

type SelectedRow = Pick<CategoryRow, "id" | "name" | "slug" | "accent_color" | "product_count">;

function toCategory(row: SelectedRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    accent: row.accent_color,
    count: row.product_count,
  };
}

export const categoriesRepository = {
  async findAll(): Promise<Category[]> {
    const { data } = await supabase
      .from("categories_with_counts")
      .select(COLUMNS)
      .order("sort_order")
      .order("name")
      .throwOnError();

    return data.map(toCategory);
  },

  async findBySlug(slug: string): Promise<Category | null> {
    const { data } = await supabase
      .from("categories_with_counts")
      .select(COLUMNS)
      .eq("slug", slug)
      .maybeSingle()
      .throwOnError();

    return data ? toCategory(data) : null;
  },
};
