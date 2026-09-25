import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { optionalUser } from "../../middleware/require-user.js";
import { validate } from "../../middleware/validate.js";
import { checkoutController } from "./checkout.controller.js";
import { checkoutSessionParamsSchema, createCheckoutSchema } from "./checkout.schema.js";

// The webhook route lives in app.ts (it needs the raw body); see checkout.controller.ts.
export const checkoutRouter = Router();

checkoutRouter.post(
  "/sessions",
  // Every checkout holds stock for up to 30 minutes, so cap how often one visitor can start one.
  rateLimit({ windowMs: 60_000, limit: 10, message: "Too many checkout attempts, try again in a minute" }),
  validate({ body: createCheckoutSchema }),
  optionalUser,
  checkoutController.createSession,
);

checkoutRouter.get(
  "/sessions/:sessionId",
  validate({ params: checkoutSessionParamsSchema }),
  checkoutController.getOrder,
);

// Called by the cart when Stripe's "back" link returns an unpaid shopper.
checkoutRouter.post(
  "/sessions/:sessionId/abandon",
  validate({ params: checkoutSessionParamsSchema }),
  checkoutController.abandon,
);
