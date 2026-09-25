import { supabase } from "../../lib/supabase.js";
import type { OrderItemRow, OrderListRow, OrderRow, OrderStatus } from "./admin-orders.types.js";

type OrderSearch = {
  status: OrderStatus | null;
  query: string | undefined;
  limit: number;
  offset: number;
};

export type OrderWithItems = OrderRow & {
  order_items: Pick<
    OrderItemRow,
    "id" | "product_id" | "product_name" | "unit_price_cents" | "quantity" | "line_total_cents"
  >[];
};

const ORDER_DETAIL_COLUMNS = `id, status, customer_email, customer_name, currency, subtotal_cents, total_cents,
  shipping_address, stripe_checkout_session_id, stripe_payment_intent_id,
  created_at, updated_at, paid_at, fulfilled_at, cancelled_at,
  order_items (id, product_id, product_name, unit_price_cents, quantity, line_total_cents)`;

export const adminOrdersRepository = {
  async search(search: OrderSearch): Promise<{ rows: OrderListRow[]; total: number }> {
    const { data } = await supabase
      .rpc("admin_search_orders", {
        p_status: search.status,
        p_query: search.query ?? null,
        p_limit: search.limit,
        p_offset: search.offset,
      })
      .throwOnError();

    // Every row carries the total; a page past the end has no rows, and so no total.
    return { rows: data, total: data[0]?.total_count ?? 0 };
  },

  async statusCounts(): Promise<{ status: OrderStatus; count: number }[]> {
    const { data } = await supabase.rpc("order_status_counts").throwOnError();
    return data.map((row) => ({ status: row.status, count: Number(row.order_count) }));
  },

  async findById(id: string): Promise<OrderWithItems | null> {
    const { data } = await supabase
      .from("orders")
      .select(ORDER_DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .throwOnError();

    return data as OrderWithItems | null;
  },

  /**
   * Moves the order to `to`, but only if it's currently in one of `from`, so a stale admin
   * tab can't ship a cancelled order. Returns false when the order didn't qualify.
   */
  async transition(
    id: string,
    from: OrderStatus[],
    to: OrderStatus,
    changes: Pick<Partial<OrderRow>, "fulfilled_at">,
  ): Promise<boolean> {
    const { data } = await supabase
      .from("orders")
      .update({ status: to, ...changes })
      .eq("id", id)
      .in("status", from)
      .select("id")
      .maybeSingle()
      .throwOnError();

    return data !== null;
  },
};
