import type { Database } from "../../types/database.js";

export type AdminBrandRow = Database["public"]["Functions"]["admin_brands"]["Returns"][number];

/** A brand as the admin panel sees it, with how many products use it. */
export type AdminBrand = {
  id: string;
  name: string;
  slug: string;
  /** Every product of the brand, hidden ones included. */
  productCount: number;
  /** Products the storefront shows. */
  activeProductCount: number;
  createdAt: string;
  updatedAt: string;
};
