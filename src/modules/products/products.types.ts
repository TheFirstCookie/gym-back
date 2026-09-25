import type { Database } from "../../types/database.js";
import type { Pagination } from "../../utils/pagination.js";

export type ProductListingRow = Omit<Database["public"]["Views"]["product_listings"]["Row"], "search_document">;

export type ProductSort = "featured" | "price-asc" | "price-desc" | "newest";
export type ProductStatus = "active" | "inactive" | "all";

type TaxonomyRef = {
  id: string;
  name: string;
  slug: string;
};

/** What product cards and search suggestions need. */
export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  /** Integer minor units (cents), so prices never pick up floating-point errors. */
  priceCents: number;
  currency: string;
  stock: number;
  tag: string | null;
  image: string | null;
  category: TaxonomyRef;
  brand: TaxonomyRef;
};

/** Full product page. */
export type Product = ProductSummary & {
  description: string;
  specs: string[];
};

export type BrandFacet = TaxonomyRef & {
  /** Active products of this brand within the current category/search, ignoring the brand filter. */
  count: number;
};

export type ProductSearchFilters = {
  category?: string;
  brands: string[];
  query?: string;
  sort: ProductSort;
  status: ProductStatus;
  limit: number;
  offset: number;
};

export type ProductSearchResult<T> = {
  items: T[];
  total: number;
};

export type ProductListResponse = {
  data: ProductSummary[];
  meta: {
    pagination: Pagination;
    facets: { brands: BrandFacet[] };
  };
};
