import type Stripe from "stripe";
import { logger } from "../../lib/logger.js";
import type { CustomerUser } from "../../middleware/require-user.js";
import { notFound, serviceUnavailable } from "../../utils/http-error.js";
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
    await checkoutRepository.recordException(orderId, "Paid Stripe session could not be applied. Review payment and inventory in Stripe.");
    logger.error("Payment received for an order that isn't payable", { orderId, status });
    throw serviceUnavailable("payment_reconciliation_required", "Payment is being reconciled; please check again later");
  }
}

/** Refund events may arrive before the session-completed event. Recover our order first. */
async function refundOrderForIntent(paymentIntentId: string) {
  let order = await checkoutRepository.refundOrderDetails(paymentIntentId);
  if (!order) {
    const session = await checkoutGateway.sessionForPaymentIntent(paymentIntentId);
    const orderId = session ? orderIdOf(session) : null;
    if (session && orderId && isPaid(session)) {
      await checkoutRepository.attachSession(orderId, session.id, null);
      await markPaid(session);
      order = await checkoutRepository.refundOrderDetails(paymentIntentId);
    }
  }
  return order;
}

/** A charge refunded in full outside the admin panel (e.g. in the Stripe dashboard). */
async function markRefunded(charge: Stripe.Charge): Promise<void> {
  if (!charge.refunded) return; // Partial refunds keep the order as it is.

  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const order = await refundOrderForIntent(paymentIntentId);
  if (!order) return;

  // Stock stays as is: restocking is a separate admin decision (was the parcel returned?).
  const state = await checkoutGateway.fullRefundState(paymentIntentId, charge.amount);
  if (state) await checkoutRepository.recordRefund(order.id, state.id, state.status);
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
  async createCheckout(items: CartItem[], user: CustomerUser | null = null): Promise<CheckoutSession> {
    // Fail before reserving anything if checkout can't complete.
    checkoutGateway.assertConfigured();

    // Opportunistic cleanup: frees stock held by abandoned orders whose expiry webhook
    // never arrived. Failing here must not block this shopper.
    await checkoutRepository.releaseStaleOrders().catch((error: unknown) => {
      logger.warn("Couldn't release stale orders", { err: error });
    });

    const order = await checkoutRepository.createPendingOrder(items);
    let session: Stripe.Checkout.Session | null = null;
    let started = false;
    try {
      await checkoutRepository.startAttempt(order.orderId, user?.id ?? null);
      started = true;
      session = await checkoutGateway.createSession(order, user?.email ?? null);
      await checkoutRepository.attachSession(order.orderId, session.id, user?.id ?? null);

      if (!session.url) throw new Error(`Checkout session ${session.id} has no URL`);
      return { sessionId: session.id, url: session.url };
    } catch (error) {
      // A timeout can mean Stripe accepted the request. Keep that reservation until
      // maintenance locates/expirs the external session; never infer failure from a timeout.
      try {
        if (session) {
          const closed = await checkoutGateway.expireSession(session.id);
          if (isPaid(closed)) {
            await checkoutRepository.attachSession(order.orderId, session.id, user?.id ?? null);
            await markPaid(closed);
          }
          else if (closed.status === "expired") await checkoutRepository.cancelPending(order.orderId);
        } else if (!started) {
          await checkoutRepository.cancelPending(order.orderId);
        }
      } catch (recoveryError) {
        logger.error("Checkout needs reconciliation", { orderId: order.orderId, err: recoveryError });
      }
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
    if ((order.status !== "pending" && order.status !== "cancelled") || !checkoutGateway.isConfigured()) return order;

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
    } else if (session.status === "expired") {
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
    const attempt = await checkoutRepository.beginRefund(orderId, restock);
    const refund = await checkoutGateway.refundPayment(paymentIntentId, orderId, attempt);
    if (refund) {
      await checkoutRepository.recordRefund(orderId, refund.id, refund.status ?? "pending", attempt);
    } else {
      const state = await checkoutGateway.fullRefundState(paymentIntentId);
      if (state) await checkoutRepository.recordRefund(orderId, state.id, state.status, attempt);
    }
  },

  /** Puts a refunded order's items back in stock, once (e.g. when the parcel comes back). */
  async restockRefundedOrder(orderId: string): Promise<boolean> {
    return checkoutRepository.restockRefunded(orderId);
  },

  /** Reconciles durable reservations/refunds even when a webhook was missed. */
  async maintain(): Promise<void> {
    if (!checkoutGateway.isConfigured()) return;
    await checkoutRepository.releaseStaleOrders();
    for (const order of await checkoutRepository.staleLinkedOrders()) {
      try {
        let session = order.stripe_checkout_session_id
          ? await checkoutGateway.retrieveSession(order.stripe_checkout_session_id)
          : order.checkout_started_at ? await checkoutGateway.findSession(order.id, order.checkout_started_at) : null;
        if (!session) {
          // The bounded scan must have completed successfully before absence is trusted.
          await checkoutRepository.cancelPending(order.id);
        } else {
          await checkoutRepository.attachSession(order.id, session.id, order.user_id);
          if (isPaid(session)) await markPaid(session);
          else {
            if (session.status === "open") session = await checkoutGateway.expireSession(session.id);
            if (isPaid(session)) await markPaid(session);
            else if (session.status === "expired") await checkoutRepository.cancelPending(order.id);
            // Completed delayed payments retain stock until a definitive success/failure.
          }
        }
      } catch (error) {
        logger.error("Checkout reconciliation failed", { orderId: order.id, err: error });
      } finally { await checkoutRepository.checked(order.id); }
    }
    for (const order of await checkoutRepository.pendingRefunds()) {
      try {
        const refund = order.stripe_refund_id ? await checkoutGateway.retrieveRefund(order.stripe_refund_id)
          : order.stripe_payment_intent_id && order.refund_attempt
            ? await checkoutGateway.refundPayment(order.stripe_payment_intent_id, order.id, order.refund_attempt) : null;
        if (refund) await checkoutRepository.recordRefund(order.id, refund.id, refund.status ?? "pending", order.refund_attempt ?? undefined);
      } catch (error) { logger.error("Refund reconciliation failed", { orderId: order.id, err: error }); }
      finally { await checkoutRepository.checked(order.id); }
    }
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
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const refund = event.data.object;
        const intent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
        const order = intent ? await refundOrderForIntent(intent) : null;
        if (order && refund.amount === order.total_cents) {
          await checkoutRepository.recordRefund(order.id, refund.id, refund.status ?? "pending", refund.metadata?.refund_attempt);
        } else if (order && intent && refund.status === "succeeded") {
          const full = await checkoutGateway.fullRefundState(intent, order.total_cents);
          if (full) await checkoutRepository.recordRefund(order.id, full.id, full.status);
        }
        return;
      }
      case "charge.refunded":
        await markRefunded(event.data.object);
        return;
      default:
        // Other events are acknowledged and ignored.
        return;
    }
  },
};
