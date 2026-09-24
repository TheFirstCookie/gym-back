import type { Database } from "../../types/database.js";

export type CategoryRow = Database["public"]["Views"]["categories_with_counts"]["Row"];

/** Public API shape; matches the frontend's `Category` type. */
export type Category = {
  id: string;
  name: string;
  slug: string;
  accent: string;
  /** Number of active products in the category. */
  count: number;
};
