import { notFound } from "../../utils/http-error.js";
import { toLimitOffset, toPagination } from "../../utils/pagination.js";
import { variantsRepository } from "../variants/variants.repository.js";
import { toProduct, toProductSummary } from "./products.mapper.js";
import { productsRepository } from "./products.repository.js";
import type { ProductListQuery } from "./products.schema.js";
import type { Product, ProductListingRow, ProductListResponse, ProductSummary } from "./products.types.js";

/** Listing rows as product cards, with their variants' price range. */
export async function toSummaries(rows: ProductListingRow[]): Promise<ProductSummary[]> {
  const variants = await variantsRepository.listByProduct(rows.map((row) => row.id));
  return rows.map((row) => toProductSummary(row, variants.get(row.id)));
}

export const productsService = {
  async list(query: ProductListQuery): Promise<ProductListResponse> {
    const filters = { category: query.category, query: query.q };

    // Independent queries, so run them side by side.
    const [result, brandFacets] = await Promise.all([
      productsRepository.search({
        ...filters,
        brands: query.brand,
        sort: query.sort,
        status: "active",
        ...toLimitOffset(query),
      }),
      productsRepository.brandFacets(filters),
    ]);

    return {
      data: await toSummaries(result.items),
      meta: {
        pagination: toPagination(query, result.total),
        facets: { brands: brandFacets },
      },
    };
  },

  async getBySlug(slug: string): Promise<Product> {
    const row = await productsRepository.findActiveBySlug(slug);
    if (!row) throw notFound(`Product "${slug}" not found`);
    const variants = await variantsRepository.listByProduct([row.id]);
    return toProduct(row, variants.get(row.id));
  },

  async listRelated(slug: string, limit: number): Promise<ProductSummary[]> {
    // 404 for unknown products instead of an empty list that hides a typo in the URL.
    await productsService.getBySlug(slug);
    const rows = await productsRepository.findRelated(slug, limit);
    return toSummaries(rows);
  },
};
