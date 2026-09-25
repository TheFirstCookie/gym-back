import { supabase } from "../../lib/supabase.js";
import type {
  BrandFacet,
  ProductListingRow,
  ProductSearchFilters,
  ProductSearchResult,
} from "./products.types.js";

/** Every listing column except search_document, which never leaves the database. */
// One string literal (not joined at runtime) so supabase-js can infer the row type from it.
export const LISTING_COLUMNS = `id, name, slug, price_cents, currency, stock, tag, image_url, description, specs,
  sort_order, is_active, created_at, updated_at, category_id, category_name, category_slug,
  brand_id, brand_name, brand_slug`;

export const productsRepository = {
  /** Filtered, searched, sorted page of products (see search_products in migration 0002). */
  async search(filters: ProductSearchFilters): Promise<ProductSearchResult<ProductListingRow>> {
    const { data } = await supabase
      .rpc("search_products", {
        p_category: filters.category ?? null,
        p_brands: filters.brands.length > 0 ? filters.brands : null,
        p_query: filters.query ?? null,
        p_sort: filters.sort,
        p_status: filters.status,
        p_limit: filters.limit,
        p_offset: filters.offset,
      })
      .throwOnError();

    const rows = data ?? [];
    // The count rides along on every row; an out-of-range page has no rows to carry it.
    const total = rows[0]?.total_count ?? 0;
    return { items: rows.map(({ total_count: _total, ...row }) => row), total };
  },

  async brandFacets(filters: Pick<ProductSearchFilters, "category" | "query">): Promise<BrandFacet[]> {
    const { data } = await supabase
      .rpc("product_brand_facets", {
        p_category: filters.category ?? null,
        p_query: filters.query ?? null,
      })
      .throwOnError();

    return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug, count: row.product_count }));
  },

  async findActiveBySlug(slug: string): Promise<ProductListingRow | null> {
    const { data } = await supabase
      .from("product_listings")
      .select(LISTING_COLUMNS)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .throwOnError();

    return data;
  },

  async findRelated(slug: string, limit: number): Promise<ProductListingRow[]> {
    const { data } = await supabase
      .rpc("related_products", { p_slug: slug, p_limit: limit })
      .select(LISTING_COLUMNS)
      .throwOnError();

    return data ?? [];
  },
};
