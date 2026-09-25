import { supabase } from "../../lib/supabase.js";
import { toShippingAddress } from "../../utils/shipping-address.js";
import type { ConfirmationOrder } from "./order-emails.types.js";

export const orderEmailsRepository = {
  async findOrder(orderId: string): Promise<ConfirmationOrder | null> {
    const { data } = await supabase
      .from("orders")
      .select(
        `id, customer_email, customer_name, currency, subtotal_cents, total_cents, shipping_address,
         order_items (product_name, unit_price_cents, quantity, line_total_cents)`,
      )
      .eq("id", orderId)
      .maybeSingle()
      .throwOnError();

    if (!data) return null;

    return {
      id: data.id,
      customerEmail: data.customer_email,
      customerName: data.customer_name,
      currency: data.currency,
      subtotalCents: data.subtotal_cents,
      totalCents: data.total_cents,
      shippingAddress: toShippingAddress(data.shipping_address),
      items: data.order_items
        .map((item) => ({
          name: item.product_name,
          unitPriceCents: item.unit_price_cents,
          quantity: item.quantity,
          lineTotalCents: item.line_total_cents,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },

  /**
   * Marks the confirmation as sent, but only if nobody did yet. Returns true for the one
   * caller that gets to send it, so a webhook retried by Stripe never emails twice.
   */
  async claimConfirmation(orderId: string): Promise<boolean> {
    const { data } = await supabase
      .from("orders")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("confirmation_email_sent_at", null)
      .select("id")
      .maybeSingle()
      .throwOnError();

    return data !== null;
  },

  /** Undoes a claim after a failed send, so a later attempt can try again. */
  async releaseConfirmation(orderId: string): Promise<void> {
    await supabase
      .from("orders")
      .update({ confirmation_email_sent_at: null })
      .eq("id", orderId)
      .throwOnError();
  },
};
