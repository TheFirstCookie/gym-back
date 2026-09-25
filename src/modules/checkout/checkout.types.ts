import type { Database, Json } from "../../types/database.js";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** One cart line as sent by the storefront. */
export type CartItem = {
  slug: string;
  quantity: number;
};

/** A line of a freshly reserved order, priced from the database (never from the client). */
export type PendingOrderLine = {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
};

export type PendingOrder = {
  orderId: string;
  currency: string;
  subtotalCents: number;
  lines: PendingOrderLine[];
};

/** Payment details copied from Stripe onto the order once it's paid. */
export type PaymentDetails = {
  orderId: string;
  sessionId: string;
  paymentIntentId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  shippingAddress: Json | null;
  totalCents: number | null;
};

/** What the storefront's confirmation page shows. */
export type OrderSummary = {
  id: string;
  status: OrderStatus;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  customerEmail: string | null;
  createdAt: string;
  paidAt: string | null;
  items: {
    productId: string | null;
    name: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }[];
};

export type CheckoutSession = {
  sessionId: string;
  /** Stripe-hosted payment page to send the shopper to. */
  url: string;
};
