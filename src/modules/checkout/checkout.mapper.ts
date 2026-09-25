import type Stripe from "stripe";
import type { Json } from "../../types/database.js";
import type { PaymentDetails } from "./checkout.types.js";

/** The order a Stripe Checkout session belongs to (set when the session was created). */
export function orderIdOf(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.order_id ?? session.client_reference_id ?? null;
}

export function isPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

export function toPaymentDetails(session: Stripe.Checkout.Session, orderId: string): PaymentDetails {
  const shipping = session.collected_information?.shipping_details ?? null;
  const paymentIntent = session.payment_intent;

  return {
    orderId,
    sessionId: session.id,
    paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : (paymentIntent?.id ?? null),
    customerEmail: session.customer_details?.email ?? null,
    customerName: shipping?.name ?? session.customer_details?.name ?? null,
    shippingAddress: shipping ? (JSON.parse(JSON.stringify(shipping)) as Json) : null,
    totalCents: session.amount_total,
  };
}
