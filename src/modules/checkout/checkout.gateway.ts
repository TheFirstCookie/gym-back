import Stripe from "stripe";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { stripe } from "../../lib/stripe.js";
import { HttpError, serviceUnavailable } from "../../utils/http-error.js";
import type { PendingOrder } from "./checkout.types.js";

// The only place that talks to Stripe, like a repository is for the database.

/** Stripe's minimum Checkout lifetime; reserved stock is released when it expires. */
const SESSION_LIFETIME_SECONDS = 30 * 60;

// Where the shop ships. Stripe asks for an address in one of these during checkout.
const SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
  "AT", "BE", "BG", "CA", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR",
  "HU", "IE", "IT", "LT", "LU", "LV", "MD", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK", "US",
];

function requireStripe(): Stripe {
  if (!stripe) throw serviceUnavailable("checkout_unavailable", "Checkout isn't set up yet");
  return stripe;
}

function requireStorefrontUrl(): string {
  if (!env.storefrontUrl) {
    throw serviceUnavailable("checkout_unavailable", "Checkout isn't set up yet (no storefront URL)");
  }
  return env.storefrontUrl;
}

/** Stripe errors become a 502: the shopper did nothing wrong, the payment provider failed. */
function toGatewayError(error: unknown): unknown {
  if (error instanceof Stripe.errors.StripeError) {
    // The client only gets a generic message; keep Stripe's explanation for debugging.
    logger.error("Stripe request failed", { type: error.type, code: error.code, err: error });
    return new HttpError(502, "payment_provider_error", "The payment provider didn't respond, try again");
  }
  return error;
}

export const checkoutGateway = {
  isConfigured(): boolean {
    return stripe !== null && Boolean(env.storefrontUrl);
  },

  /** Throws a 503 explaining what's missing when checkout can't run. */
  assertConfigured(): void {
    requireStripe();
    requireStorefrontUrl();
  },

  async createSession(order: PendingOrder): Promise<Stripe.Checkout.Session> {
    const client = requireStripe();
    const storefront = requireStorefrontUrl();

    try {
      return await client.checkout.sessions.create(
        {
          mode: "payment",
          line_items: order.lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: order.currency,
              unit_amount: line.unitPriceCents,
              product_data: {
                name: line.name,
                // Stripe only shows images it can fetch over https.
                images: line.imageUrl?.startsWith("https://") ? [line.imageUrl] : undefined,
                metadata: { product_id: line.productId, slug: line.slug },
              },
            },
          })),
          // Two links back to the order, so webhook events can always be matched to it.
          client_reference_id: order.orderId,
          metadata: { order_id: order.orderId },
          payment_intent_data: { metadata: { order_id: order.orderId } },
          shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
          expires_at: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
          success_url: `${storefront}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${storefront}/cart?checkout=cancelled`,
        },
        // A retried request can't create a second session for the same order.
        { idempotencyKey: `checkout-order-${order.orderId}` },
      );
    } catch (error) {
      throw toGatewayError(error);
    }
  },

  /**
   * Closes an open session so it can't be paid anymore. Returns the session as it is now:
   * if it was already completed or expired, Stripe refuses and the current state is fetched.
   */
  async expireSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    const client = requireStripe();
    try {
      return await client.checkout.sessions.expire(sessionId);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        return checkoutGateway.retrieveSession(sessionId);
      }
      throw toGatewayError(error);
    }
  },

  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await requireStripe().checkout.sessions.retrieve(sessionId);
    } catch (error) {
      throw toGatewayError(error);
    }
  },

  /**
   * Verifies that a webhook really came from Stripe (signature over the raw body) and
   * parses it. Throws on a bad signature, which the webhook handler answers with 400.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw serviceUnavailable("webhook_unavailable", "STRIPE_WEBHOOK_SECRET isn't set");
    }
    return requireStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  },
};
