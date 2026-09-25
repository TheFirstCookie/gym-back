import type { Database } from "../../types/database.js";
import type { Pagination } from "../../utils/pagination.js";
import type { BrandFacet, Product } from "../products/products.types.js";

export type ProductInsertRow = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdateRow = Database["public"]["Tables"]["products"]["Update"];

/** A product as the admin panel sees it: storefront fields plus merchandising state. */
export type AdminProduct = Product & {
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductListResponse = {
  data: AdminProduct[];
  meta: {
    pagination: Pagination;
    facets: { brands: BrandFacet[] };
  };
};
