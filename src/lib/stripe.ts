import Stripe from "stripe";
import { env } from "../config/env.js";

/**
 * Stripe client, or null when STRIPE_SECRET_KEY isn't set (checkout then answers 503).
 * Only the checkout module's gateway should import it.
 */
export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, {
      // Checkout creation is on the shopper's critical path; fail fast rather than hang.
      timeout: 15_000,
      maxNetworkRetries: 1,
      appInfo: { name: "ForgeFit Supply API" },
    })
  : null;
