import { supabase } from "../../lib/supabase.js";
import type { Database } from "../../types/database.js";
import { LISTING_COLUMNS } from "../products/products.repository.js";
import type { ProductListingRow } from "../products/products.types.js";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

export type CustomerOrderRow = Pick<
  OrderRow,
  | "id"
  | "status"
  | "currency"
  | "subtotal_cents"
  | "total_cents"
  | "created_at"
  | "paid_at"
  | "fulfilled_at"
  | "refunded_at"
  | "shipping_address"
> & {
  order_items: Pick<
    OrderItemRow,
    "product_id" | "product_name" | "variant_name" | "unit_price_cents" | "quantity" | "line_total_cents"
  >[];
};

const ORDER_COLUMNS = `id, status, currency, subtotal_cents, total_cents, created_at, paid_at, fulfilled_at,
  refunded_at, shipping_address,
  order_items (product_id, product_name, variant_name, unit_price_cents, quantity, line_total_cents)`;

/** Orders a customer sees: paid ones, whatever happened after. Open or abandoned checkouts aren't orders yet. */
const VISIBLE_STATUSES = ["paid", "fulfilled", "refunded"] as const;

const UNIQUE_VIOLATION = "23505";

export const accountRepository = {
  async listOrders(userId: string, limit: number): Promise<CustomerOrderRow[]> {
    const { data } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("user_id", userId)
      .in("status", [...VISIBLE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(limit)
      .throwOnError();
    return data as unknown as CustomerOrderRow[];
  },

  /** Only finds the order if it belongs to this user. */
  async findOrder(userId: string, orderId: string): Promise<CustomerOrderRow | null> {
    const { data } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", orderId)
      .eq("user_id", userId)
      .in("status", [...VISIBLE_STATUSES])
      .maybeSingle()
      .throwOnError();
    return data as unknown as CustomerOrderRow | null;
  },

  /** Current slug and photo of the given products (removed products are simply absent). */
  async productLinks(productIds: string[]): Promise<Map<string, { slug: string; image: string | null }>> {
    if (productIds.length === 0) return new Map();
    const { data } = await supabase
      .from("products")
      .select("id, slug, image_url")
      .in("id", productIds)
      .throwOnError();
    return new Map(data.map((row) => [row.id, { slug: row.slug, image: row.image_url }]));
  },

  async wishlist(userId: string): Promise<{ product_id: string; created_at: string }[]> {
    const { data } = await supabase
      .from("wishlist_items")
      .select("product_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .throwOnError();
    return data;
  },

  /** Live products among these ids, as listing rows. */
  async listings(productIds: string[]): Promise<ProductListingRow[]> {
    if (productIds.length === 0) return [];
    const { data } = await supabase
      .from("product_listings")
      .select(LISTING_COLUMNS)
      .in("id", productIds)
      .eq("is_active", true)
      .throwOnError();
    return data;
  },

  async activeProductId(slug: string): Promise<string | null> {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .throwOnError();
    return data?.id ?? null;
  },

  /** Adding something that's already on the list is fine: it stays there once. */
  async addToWishlist(userId: string, productId: string): Promise<void> {
    try {
      await supabase.from("wishlist_items").insert({ user_id: userId, product_id: productId }).throwOnError();
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
    }
  },

  async removeFromWishlist(userId: string, productSlug: string): Promise<void> {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("slug", productSlug)
      .maybeSingle()
      .throwOnError();
    if (!product) return;

    await supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", product.id)
      .throwOnError();
  },
};
