import type Stripe from "stripe";
import { logger } from "../../lib/logger.js";
import { notFound } from "../../utils/http-error.js";
import { checkoutGateway } from "./checkout.gateway.js";
import { isPaid, orderIdOf, toPaymentDetails } from "./checkout.mapper.js";
import { checkoutRepository } from "./checkout.repository.js";
import type { CartItem, CheckoutSession, OrderSummary } from "./checkout.types.js";

async function markPaid(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (!orderId) {
    logger.warn("Paid Checkout session has no order id", { sessionId: session.id });
    return;
  }

  const status = await checkoutRepository.markPaid(toPaymentDetails(session, orderId));
  if (status !== "paid") {
    // e.g. the order was already released as stale; needs a human (refund or restock).
    logger.error("Payment received for an order that isn't payable", { orderId, status, sessionId: session.id });
  }
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
      default:
        // Other events are acknowledged and ignored.
        return;
    }
  },
};
