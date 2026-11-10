import { supabase } from "../../lib/supabase.js";
import { byItemName, itemLabel } from "../../utils/order-items.js";
import { toShippingAddress } from "../../utils/shipping-address.js";
import type { ConfirmationOrder } from "./order-emails.types.js";

export const orderEmailsRepository = {
  async findOrder(orderId: string): Promise<ConfirmationOrder | null> {
    const { data } = await supabase
      .from("orders")
      .select(
        `id, customer_email, customer_name, currency, subtotal_cents, total_cents, shipping_address,
         order_items (product_name, variant_name, unit_price_cents, quantity, line_total_cents)`,
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
          variantName: item.variant_name,
          unitPriceCents: item.unit_price_cents,
          quantity: item.quantity,
          lineTotalCents: item.line_total_cents,
        }))
        .sort(byItemName)
        // The email shows one name per line: "Olympic plate (20 kg)".
        .map(({ variantName, ...item }) => ({ ...item, name: itemLabel(item.name, variantName) })),
    };
  },

  async due(): Promise<string[]> {
    const { data } = await supabase.from("order_email_jobs").select("order_id")
      .is("sent_at", null).lte("next_attempt_at", new Date().toISOString())
      .or(`claimed_at.is.null,claimed_at.lt.${new Date(Date.now() - 300_000).toISOString()}`)
      .order("next_attempt_at").order("order_id").limit(20).throwOnError();
    return data.map((row) => row.order_id);
  },
  async claimConfirmation(orderId: string): Promise<string | null> {
    const { data } = await supabase.rpc("claim_order_email", { p_order_id: orderId }).throwOnError();
    return data;
  },
  async finishConfirmation(orderId: string, token: string, success: boolean): Promise<void> {
    await supabase.rpc("finish_order_email", { p_order_id: orderId, p_token: token, p_success: success }).throwOnError();
  },
};
