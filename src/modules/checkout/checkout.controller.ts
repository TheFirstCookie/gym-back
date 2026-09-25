import type { Request, RequestHandler, Response } from "express";
import { badRequest, HttpError } from "../../utils/http-error.js";
import { checkoutGateway } from "./checkout.gateway.js";
import type { CheckoutSessionParams, CreateCheckoutInput } from "./checkout.schema.js";
import { checkoutService } from "./checkout.service.js";

export const checkoutController = {
  async createSession(req: Request<unknown, unknown, CreateCheckoutInput>, res: Response) {
    res.status(201).json({ data: await checkoutService.createCheckout(req.body.items) });
  },

  async getOrder(req: Request<CheckoutSessionParams>, res: Response) {
    res.json({ data: await checkoutService.getOrderBySession(req.params.sessionId) });
  },

  async abandon(req: Request<CheckoutSessionParams>, res: Response) {
    res.json({ data: await checkoutService.abandonCheckout(req.params.sessionId) });
  },
};

/**
 * POST /api/v1/checkout/webhook. Mounted in app.ts ahead of express.json(), because the
 * signature is checked against the exact bytes Stripe sent, so req.body must be a Buffer.
 */
export const stripeWebhookHandler: RequestHandler = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || !Buffer.isBuffer(req.body)) {
    throw badRequest("Missing Stripe signature or body");
  }

  let event;
  try {
    event = checkoutGateway.constructWebhookEvent(req.body, signature);
  } catch (error) {
    // Configuration problems (503) pass through; anything else is a bad signature.
    if (error instanceof HttpError) throw error;
    throw badRequest("Invalid Stripe signature");
  }

  await checkoutService.handleWebhookEvent(event);
  // Any 2xx tells Stripe to stop retrying; errors above make it retry later.
  res.json({ received: true });
};
