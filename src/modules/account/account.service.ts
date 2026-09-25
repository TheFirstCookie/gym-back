import { notFound } from "../../utils/http-error.js";
import { toShippingAddress } from "../../utils/shipping-address.js";
import { toProductSummary } from "../products/products.mapper.js";
import { accountRepository, type CustomerOrderRow } from "./account.repository.js";
import type { CustomerOrder, WishlistItem } from "./account.types.js";

/** Enough for an order history page; older orders can get paging when someone has this many. */
const ORDER_HISTORY_LIMIT = 50;

async function toCustomerOrders(rows: CustomerOrderRow[]): Promise<CustomerOrder[]> {
  const productIds = [
    ...new Set(rows.flatMap((row) => row.order_items.map((item) => item.product_id)).filter((id) => id !== null)),
  ];
  const links = await accountRepository.productLinks(productIds);

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    totalCents: row.total_cents,
    itemCount: row.order_items.reduce((total, item) => total + item.quantity, 0),
    createdAt: row.created_at,
    paidAt: row.paid_at,
    fulfilledAt: row.fulfilled_at,
    refundedAt: row.refunded_at,
    shippingAddress: toShippingAddress(row.shipping_address),
    items: row.order_items
      .map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        lineTotalCents: item.line_total_cents,
        product: (item.product_id && links.get(item.product_id)) || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export const accountService = {
  async listOrders(userId: string): Promise<CustomerOrder[]> {
    return toCustomerOrders(await accountRepository.listOrders(userId, ORDER_HISTORY_LIMIT));
  },

  async getOrder(userId: string, orderId: string): Promise<CustomerOrder> {
    const row = await accountRepository.findOrder(userId, orderId);
    // Someone else's order looks exactly like a missing one.
    if (!row) throw notFound("Order not found");
    const [order] = await toCustomerOrders([row]);
    return order!;
  },

  /** Newest first. Products that were hidden or deleted since drop off the list. */
  async wishlist(userId: string): Promise<WishlistItem[]> {
    const entries = await accountRepository.wishlist(userId);
    const listings = await accountRepository.listings(entries.map((entry) => entry.product_id));
    const byId = new Map(listings.map((row) => [row.id, row]));

    return entries.flatMap((entry) => {
      const row = byId.get(entry.product_id);
      return row ? [{ ...toProductSummary(row), addedAt: entry.created_at }] : [];
    });
  },

  async addToWishlist(userId: string, slug: string): Promise<void> {
    const productId = await accountRepository.activeProductId(slug);
    if (!productId) throw notFound("Product not found");
    await accountRepository.addToWishlist(userId, productId);
  },

  /** Removing something that isn't on the list is a no-op. */
  async removeFromWishlist(userId: string, slug: string): Promise<void> {
    await accountRepository.removeFromWishlist(userId, slug);
  },
};
