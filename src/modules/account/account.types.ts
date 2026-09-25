import type { ShippingAddress } from "../../utils/shipping-address.js";
import type { OrderStatus } from "../admin-orders/admin-orders.types.js";
import type { ProductSummary } from "../products/products.types.js";

/** One of the signed-in customer's own orders. */
export type CustomerOrder = {
  id: string;
  status: OrderStatus;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  itemCount: number;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  refundedAt: string | null;
  shippingAddress: ShippingAddress | null;
  items: {
    name: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    /** The product as it is now, for a link and photo; null if it was removed from the shop. */
    product: { slug: string; image: string | null } | null;
  }[];
};

export type WishlistItem = ProductSummary & {
  /** When it was added to the wishlist. */
  addedAt: string;
};
