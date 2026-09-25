import { supabase } from "../../lib/supabase.js";
import type { Database } from "../../types/database.js";
import type { AdminReview, RatingSummary, Review } from "./reviews.types.js";

type ReviewRow = Database["public"]["Tables"]["product_reviews"]["Row"];

const REVIEW_COLUMNS =
  "id, product_id, user_id, author_name, rating, title, body, verified_purchase, created_at, updated_at";

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    verifiedPurchase: row.verified_purchase,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const reviewsRepository = {
  /** Live products only: hidden products can't be reviewed or show reviews. */
  async productIdBySlug(slug: string): Promise<string | null> {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .throwOnError();
    return data?.id ?? null;
  },

  async summary(productId: string): Promise<RatingSummary> {
    const { data } = await supabase.rpc("product_rating_summary", { p_product_id: productId }).throwOnError();
    const row = data[0];
    const count = Number(row?.review_count ?? 0);
    return {
      count,
      average: count && row?.average !== null ? Math.round(Number(row!.average) * 10) / 10 : null,
      distribution: [
        Number(row?.one_star ?? 0),
        Number(row?.two_star ?? 0),
        Number(row?.three_star ?? 0),
        Number(row?.four_star ?? 0),
        Number(row?.five_star ?? 0),
      ],
    };
  },

  /** Newest first. */
  async list(productId: string, limit: number, offset: number): Promise<Review[]> {
    const { data } = await supabase
      .from("product_reviews")
      .select(REVIEW_COLUMNS)
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
      .throwOnError();
    return data.map(toReview);
  },

  async findByAuthor(productId: string, userId: string): Promise<Review | null> {
    const { data } = await supabase
      .from("product_reviews")
      .select(REVIEW_COLUMNS)
      .eq("product_id", productId)
      .eq("user_id", userId)
      .maybeSingle()
      .throwOnError();
    return data ? toReview(data) : null;
  },

  async hasPurchased(userId: string, productId: string): Promise<boolean> {
    const { data } = await supabase
      .rpc("has_purchased_product", { p_user_id: userId, p_product_id: productId })
      .throwOnError();
    return data;
  },

  async insert(row: Database["public"]["Tables"]["product_reviews"]["Insert"]): Promise<void> {
    await supabase.from("product_reviews").insert(row).throwOnError();
  },

  async update(
    productId: string,
    userId: string,
    changes: Database["public"]["Tables"]["product_reviews"]["Update"],
  ): Promise<void> {
    await supabase
      .from("product_reviews")
      .update(changes)
      .eq("product_id", productId)
      .eq("user_id", userId)
      .throwOnError();
  },

  async deleteByAuthor(productId: string, userId: string): Promise<void> {
    await supabase.from("product_reviews").delete().eq("product_id", productId).eq("user_id", userId).throwOnError();
  },

  /** For moderation: every review, newest first, with its product. */
  async listAll(limit: number, offset: number): Promise<AdminReview[]> {
    const { data } = await supabase
      .from("product_reviews")
      .select(REVIEW_COLUMNS)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
      .throwOnError();

    const productIds = [...new Set(data.map((row) => row.product_id))];
    const products = new Map<string, { id: string; name: string; slug: string }>();
    if (productIds.length) {
      const { data: rows } = await supabase
        .from("products")
        .select("id, name, slug")
        .in("id", productIds)
        .throwOnError();
      for (const row of rows) products.set(row.id, row);
    }

    return data.map((row) => ({
      ...toReview(row),
      userId: row.user_id,
      product: products.get(row.product_id) ?? null,
    }));
  },

  async countAll(): Promise<number> {
    const { count } = await supabase
      .from("product_reviews")
      .select("id", { count: "exact", head: true })
      .throwOnError();
    return count ?? 0;
  },

  /** Returns false when no review has this id. */
  async deleteById(id: string): Promise<boolean> {
    const { data } = await supabase
      .from("product_reviews")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle()
      .throwOnError();
    return data !== null;
  },
};
