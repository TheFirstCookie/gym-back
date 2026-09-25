import { stripeDashboardPaymentUrl } from "../../lib/stripe.js";
import type { Json } from "../../types/database.js";
import type { OrderWithItems } from "./admin-orders.repository.js";
import { ORDER_STATUSES } from "./admin-orders.schema.js";
import type {
  AdminOrder,
  AdminOrderListItem,
  OrderListRow,
  OrderStatus,
  OrderStatusCounts,
  ShippingAddress,
} from "./admin-orders.types.js";

export function toAdminOrderListItem(row: OrderListRow): AdminOrderListItem {
  return {
    id: row.id,
    status: row.status,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    currency: row.currency,
    totalCents: row.total_cents,
    itemCount: row.item_count,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    fulfilledAt: row.fulfilled_at,
  };
}

function textOrNull(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * orders.shipping_address holds Stripe's shipping_details as-is:
 * { name, address: { line1, line2, city, state, postal_code, country } }.
 */
export function toShippingAddress(value: Json | null): ShippingAddress | null {
  if (!isObject(value)) return null;
  const address = isObject(value.address) ? value.address : {};

  return {
    name: textOrNull(value.name),
    line1: textOrNull(address.line1),
    line2: textOrNull(address.line2),
    city: textOrNull(address.city),
    state: textOrNull(address.state),
    postalCode: textOrNull(address.postal_code),
    country: textOrNull(address.country),
  };
}

export function toAdminOrder(row: OrderWithItems): AdminOrder {
  const itemCount = row.order_items.reduce((total, item) => total + item.quantity, 0);

  return {
    ...toAdminOrderListItem({ ...row, item_count: itemCount, total_count: 1 }),
    subtotalCents: row.subtotal_cents,
    shippingAddress: toShippingAddress(row.shipping_address),
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
    stripe: {
      checkoutSessionId: row.stripe_checkout_session_id,
      paymentIntentId: row.stripe_payment_intent_id,
      dashboardUrl: row.stripe_payment_intent_id ? stripeDashboardPaymentUrl(row.stripe_payment_intent_id) : null,
    },
    items: row.order_items
      .map((item) => ({
        id: item.id,
        productId: item.product_id,
        name: item.product_name,
        unitPriceCents: item.unit_price_cents,
        quantity: item.quantity,
        lineTotalCents: item.line_total_cents,
      }))
      // All lines are written in one transaction, so there's no meaningful insertion order.
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Fills in zero for statuses with no orders and adds the overall total. */
export function toStatusCounts(rows: { status: OrderStatus; count: number }[]): OrderStatusCounts {
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as OrderStatusCounts;
  counts.all = 0;

  for (const { status, count } of rows) {
    counts[status] = count;
    counts.all += count;
  }

  return counts;
}
