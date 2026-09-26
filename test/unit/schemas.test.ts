import { describe, expect, it } from "vitest";
import { createCheckoutSchema, checkoutSessionParamsSchema } from "../../src/modules/checkout/checkout.schema.js";
import { upsertReviewSchema } from "../../src/modules/reviews/reviews.schema.js";

describe("checkout request", () => {
  it("accepts slugs and quantities", () => {
    expect(createCheckoutSchema.parse({ items: [{ slug: "competition-kettlebell", quantity: 2 }] })).toEqual({
      items: [{ slug: "competition-kettlebell", quantity: 2 }],
    });
  });

  it("accepts a variant id for products with variants", () => {
    const variant = "a1111111-1111-4111-8111-111111111111";
    expect(createCheckoutSchema.parse({ items: [{ slug: "bumper-plate", variant, quantity: 1 }] })).toEqual({
      items: [{ slug: "bumper-plate", variant, quantity: 1 }],
    });
    expect(createCheckoutSchema.safeParse({ items: [{ slug: "bumper-plate", variant: "20kg", quantity: 1 }] }).success).toBe(false);
  });

  it("never accepts a price from the browser", () => {
    const result = createCheckoutSchema.safeParse({ items: [{ slug: "mat", quantity: 1, priceCents: 1 }] });
    expect(result.success).toBe(false);
  });

  it("rejects empty carts, zero quantities and oversized carts", () => {
    expect(createCheckoutSchema.safeParse({ items: [] }).success).toBe(false);
    expect(createCheckoutSchema.safeParse({ items: [{ slug: "mat", quantity: 0 }] }).success).toBe(false);
    expect(createCheckoutSchema.safeParse({ items: [{ slug: "mat", quantity: 100 }] }).success).toBe(false);
    const tooMany = Array.from({ length: 21 }, (_, index) => ({ slug: `product-${index}`, quantity: 1 }));
    expect(createCheckoutSchema.safeParse({ items: tooMany }).success).toBe(false);
  });

  it("only accepts real Stripe Checkout session ids", () => {
    expect(checkoutSessionParamsSchema.safeParse({ sessionId: "cs_test_a1B2c3" }).success).toBe(true);
    expect(checkoutSessionParamsSchema.safeParse({ sessionId: "pi_123" }).success).toBe(false);
  });
});

describe("review request", () => {
  it("needs a whole-star rating from 1 to 5", () => {
    expect(upsertReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 4.5 }).success).toBe(false);
  });

  it("trims text and treats an empty title as none", () => {
    expect(upsertReviewSchema.parse({ rating: 5, title: "  ", body: "  Great  " })).toEqual({
      rating: 5,
      title: null,
      body: "Great",
    });
    expect(upsertReviewSchema.parse({ rating: 3 })).toEqual({ rating: 3, title: null, body: "" });
  });

  it("refuses fields the server decides itself", () => {
    expect(upsertReviewSchema.safeParse({ rating: 5, verifiedPurchase: true }).success).toBe(false);
    expect(upsertReviewSchema.safeParse({ rating: 5, authorName: "Someone else" }).success).toBe(false);
  });
});
