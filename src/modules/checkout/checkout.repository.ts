import { supabase } from "../../lib/supabase.js";
import { badRequest, HttpError } from "../../utils/http-error.js";
import type {
  CartItem,
  OrderStatus,
  OrderSummary,
  PaymentDetails,
  PendingOrder,
  PendingOrderLine,
} from "./checkout.types.js";

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null };

type PendingOrderRow = {
  order_id: string;
  currency: string;
  subtotal_cents: number;
  lines: {
    product_id: string;
    slug: string;
    name: string;
    image_url: string | null;
    unit_price_cents: number;
    quantity: number;
  }[];
};

// Custom SQLSTATEs raised by create_pending_order (migration 0004), as client errors the
// storefront can act on: it gets the product slug, and for stock problems what's left.
function toCheckoutError(error: unknown): HttpError | null {
  const { code, details, hint } = (error ?? {}) as DbError;

  switch (code) {
    case "FF001":
      return new HttpError(409, "product_unavailable", "A product in your cart is no longer available", {
        slug: details,
      });
    case "FF002":
      return new HttpError(409, "insufficient_stock", "Not enough stock for a product in your cart", {
        slug: details,
        available: Number(hint),
      });
    case "FF003":
      return badRequest("Products in one order must share a currency");
    case "FF004":
      return badRequest("The cart is empty");
    default:
      return null;
  }
}

function toPendingOrder(row: PendingOrderRow): PendingOrder {
  return {
    orderId: row.order_id,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    lines: row.lines.map(
      (line): PendingOrderLine => ({
        productId: line.product_id,
        slug: line.slug,
        name: line.name,
        imageUrl: line.image_url,
        unitPriceCents: line.unit_price_cents,
        quantity: line.quantity,
      }),
    ),
  };
}

const ORDER_SUMMARY_COLUMNS = `id, status, currency, subtotal_cents, total_cents, customer_email, created_at, paid_at,
  order_items (product_id, product_name, unit_price_cents, quantity, line_total_cents)`;

export const checkoutRepository = {
  /** Validates the cart, reserves stock and snapshots prices, atomically. */
  async createPendingOrder(items: CartItem[]): Promise<PendingOrder> {
    try {
      const { data } = await supabase.rpc("create_pending_order", { p_items: items }).throwOnError();
      return toPendingOrder(data as unknown as PendingOrderRow);
    } catch (error) {
      throw toCheckoutError(error) ?? error;
    }
  },

  async attachSession(orderId: string, sessionId: string): Promise<void> {
    await supabase
      .from("orders")
      .update({ stripe_checkout_session_id: sessionId })
      .eq("id", orderId)
      .throwOnError();
  },

  /** Idempotent; returns the status the order ended up in (null if it doesn't match). */
  async markPaid(payment: PaymentDetails): Promise<OrderStatus | null> {
    const { data } = await supabase
      .rpc("mark_order_paid", {
        p_order_id: payment.orderId,
        p_session_id: payment.sessionId,
        p_payment_intent_id: payment.paymentIntentId,
        p_customer_email: payment.customerEmail,
        p_customer_name: payment.customerName,
        p_shipping_address: payment.shippingAddress,
        p_total_cents: payment.totalCents,
      })
      .throwOnError();
    return data;
  },

  /** Idempotent; returns true only for the call that actually cancelled and restocked. */
  async cancelPending(orderId: string): Promise<boolean> {
    const { data } = await supabase.rpc("cancel_pending_order", { p_order_id: orderId }).throwOnError();
    return data;
  },

  async releaseStaleOrders(): Promise<number> {
    const { data } = await supabase.rpc("release_stale_orders").throwOnError();
    return data;
  },

  async findBySession(sessionId: string): Promise<OrderSummary | null> {
    const { data } = await supabase
      .from("orders")
      .select(ORDER_SUMMARY_COLUMNS)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle()
      .throwOnError();

    if (!data) return null;

    return {
      id: data.id,
      status: data.status,
      currency: data.currency,
      subtotalCents: data.subtotal_cents,
      totalCents: data.total_cents,
      customerEmail: data.customer_email,
      createdAt: data.created_at,
      paidAt: data.paid_at,
      items: data.order_items.map((item) => ({
        productId: item.product_id,
        name: item.product_name,
        unitPriceCents: item.unit_price_cents,
        quantity: item.quantity,
        lineTotalCents: item.line_total_cents,
      })),
    };
  },
};
