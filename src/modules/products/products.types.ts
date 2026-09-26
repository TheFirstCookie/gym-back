import type { Database } from "../../types/database.js";
import type { Pagination } from "../../utils/pagination.js";
import type { ProductVariant } from "../variants/variants.types.js";

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
  /**
   * Integer minor units (cents), so prices never pick up floating-point errors. For a
   * product with variants, the cheapest one ("from $X").
   */
  priceCents: number;
  /** The most expensive variant; equals priceCents for products without variants. */
  priceMaxCents: number;
  /** Bought by picking a variant (weight, size, colour...) on the product page. */
  hasVariants: boolean;
  currency: string;
  /** For a product with variants, the total over its variants. */
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
  /** The options on sale, in display order; empty for a plain product. */
  variants: ProductVariant[];
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
