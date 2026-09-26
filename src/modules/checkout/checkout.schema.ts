import { z } from "zod";
import { slugSchema } from "../../utils/schemas.js";

export const MAX_CART_LINES = 20;
export const MAX_LINE_QUANTITY = 99;

export const createCheckoutSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        slug: slugSchema,
        /** The chosen variant's id; required for products that have variants. */
        variant: z.uuid().optional(),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
      }),
    )
    .min(1, "The cart is empty")
    .max(MAX_CART_LINES, `At most ${MAX_CART_LINES} different products per order`),
});

export const checkoutSessionParamsSchema = z.object({
  // Stripe Checkout session ids look like cs_test_a1B2... / cs_live_...
  sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/, "Not a Stripe Checkout session id"),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CheckoutSessionParams = z.infer<typeof checkoutSessionParamsSchema>;
