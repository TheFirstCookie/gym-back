import type { Database } from "../../types/database.js";

export type AdminCategoryRow = Database["public"]["Functions"]["admin_categories"]["Returns"][number];
export type CategoryInsertRow = Database["public"]["Tables"]["categories"]["Insert"];
export type CategoryUpdateRow = Database["public"]["Tables"]["categories"]["Update"];

/** A category as the admin panel sees it: storefront fields plus usage and ordering. */
export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  accent: string;
  sortOrder: number;
  /** Every product in the category, hidden ones included. */
  productCount: number;
  /** Products the storefront shows. */
  activeProductCount: number;
  createdAt: string;
  updatedAt: string;
};
