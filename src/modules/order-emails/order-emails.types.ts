import type { ShippingAddress } from "../../utils/shipping-address.js";

/** What a confirmation email needs to know about an order. */
export type ConfirmationOrder = {
  id: string;
  customerEmail: string | null;
  customerName: string | null;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  shippingAddress: ShippingAddress | null;
  items: { name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
};

export type RenderedEmail = { subject: string; html: string; text: string };
