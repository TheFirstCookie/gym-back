import type Stripe from "stripe";
import { logger } from "../../lib/logger.js";
import { notFound } from "../../utils/http-error.js";
import { orderEmailsService } from "../order-emails/order-emails.service.js";
import { checkoutGateway } from "./checkout.gateway.js";
import { isPaid, orderIdOf, toPaymentDetails } from "./checkout.mapper.js";
import { checkoutRepository } from "./checkout.repository.js";
import type { CartItem, CheckoutSession, OrderStatus, OrderSummary } from "./checkout.types.js";

/** Statuses an order can be in once it has been paid for. */
const PAID_STATUSES: OrderStatus[] = ["paid", "fulfilled", "refunded"];

async function markPaid(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (!orderId) {
    logger.warn("Paid Checkout session has no order id", { sessionId: session.id });
    return;
  }

  const status = await checkoutRepository.markPaid(toPaymentDetails(session, orderId));
  if (status === "paid") {
    // Sends at most once per order, however many times this runs; never throws.
    await orderEmailsService.sendOrderConfirmation(orderId);
  } else if (!status || !PAID_STATUSES.includes(status)) {
    // e.g. the order was already released as stale; needs a human (refund or restock).
    logger.error("Payment received for an order that isn't payable", { orderId, status, sessionId: session.id });
  }
}

/** A charge refunded in full outside the admin panel (e.g. in the Stripe dashboard). */
async function markRefunded(charge: Stripe.Charge): Promise<void> {
  if (!charge.refunded) return; // Partial refunds keep the order as it is.

  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const orderId = await checkoutRepository.findOrderIdByPaymentIntent(paymentIntentId);
  if (!orderId) return;

  // Stock stays as is: restocking is a separate admin decision (was the parcel returned?).
  await checkoutRepository.markRefunded(orderId, charge.refunds?.data[0]?.id ?? null);
}

async function cancel(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (orderId) await checkoutRepository.cancelPending(orderId);
}

export const checkoutService = {
  /**
   * Turns a cart into a pending order with reserved stock, then a Stripe Checkout session.
   * Prices always come from the database; the client only says what and how many.
   */
  async createCheckout(items: CartItem[]): Promise<CheckoutSession> {
    // Fail before reserving anything if checkout can't complete.
    checkoutGateway.assertConfigured();

    // Opportunistic cleanup: frees stock held by abandoned orders whose expiry webhook
    // never arrived. Failing here must not block this shopper.
    await checkoutRepository.releaseStaleOrders().catch((error: unknown) => {
      logger.warn("Couldn't release stale orders", { err: error });
    });

    const order = await checkoutRepository.createPendingOrder(items);

    try {
      const session = await checkoutGateway.createSession(order);
      await checkoutRepository.attachSession(order.orderId, session.id);

      if (!session.url) throw new Error(`Checkout session ${session.id} has no URL`);
      return { sessionId: session.id, url: session.url };
    } catch (error) {
      // No payment page means no sale: put the reserved stock back.
      await checkoutRepository.cancelPending(order.orderId).catch((cancelError: unknown) => {
        logger.error("Couldn't release a failed checkout's stock", { orderId: order.orderId, err: cancelError });
      });
      throw error;
    }
  },

  /**
   * The order behind a Checkout session, for the storefront's confirmation page. If the
   * webhook hasn't arrived yet, asks Stripe directly, so the page never says "pending"
   * for an order that's actually paid.
   */
  async getOrderBySession(sessionId: string): Promise<OrderSummary> {
    const order = await checkoutRepository.findBySession(sessionId);
    if (!order) throw notFound("Order not found");
    if (order.status !== "pending" || !checkoutGateway.isConfigured()) return order;

    const session = await checkoutGateway.retrieveSession(sessionId);
    if (isPaid(session)) {
      await markPaid(session);
    } else if (session.status === "expired") {
      await cancel(session);
    } else {
      return order;
    }

    return (await checkoutRepository.findBySession(sessionId)) ?? order;
  },

  /**
   * The shopper came back from Stripe without paying: close their session and put the
   * stock back now, instead of holding it until Stripe expires the session (30 minutes).
   * If they did pay after all (another tab), the payment is recorded instead.
   */
  async abandonCheckout(sessionId: string): Promise<OrderSummary> {
    const order = await checkoutRepository.findBySession(sessionId);
    if (!order) throw notFound("Order not found");
    if (order.status !== "pending") return order;

    checkoutGateway.assertConfigured();
    const session = await checkoutGateway.expireSession(sessionId);
    if (isPaid(session)) {
      await markPaid(session);
    } else {
      await checkoutRepository.cancelPending(order.id);
    }

    return (await checkoutRepository.findBySession(sessionId)) ?? order;
  },

  /**
   * Refunds a paid order in full through Stripe, then records it. `restock` puts the items
   * back on the shelf. Callers check the order's status first (see admin-orders).
   */
  async refundOrder(orderId: string, paymentIntentId: string, restock: boolean): Promise<void> {
    checkoutGateway.assertConfigured();
    const refund = await checkoutGateway.refundPayment(paymentIntentId, orderId);
    await checkoutRepository.markRefunded(orderId, refund?.id ?? null);
    if (restock) await checkoutRepository.restockRefunded(orderId);
  },

  /** Puts a refunded order's items back in stock, once (e.g. when the parcel comes back). */
  async restockRefundedOrder(orderId: string): Promise<boolean> {
    return checkoutRepository.restockRefunded(orderId);
  },

  /** Applies a verified Stripe webhook event. Safe to receive the same event twice. */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
        // Card payments are paid by now; delayed methods (bank debits) report later.
        if (isPaid(event.data.object)) await markPaid(event.data.object);
        return;
      case "checkout.session.async_payment_succeeded":
        await markPaid(event.data.object);
        return;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await cancel(event.data.object);
        return;
      case "charge.refunded":
        await markRefunded(event.data.object);
        return;
      default:
        // Other events are acknowledged and ignored.
        return;
    }
  },
};
