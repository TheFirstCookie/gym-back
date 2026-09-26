import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutGateway } from "../../src/modules/checkout/checkout.gateway.js";
import { checkoutRepository } from "../../src/modules/checkout/checkout.repository.js";
import type { PendingOrder } from "../../src/modules/checkout/checkout.types.js";
import { api, bearer, fakeSessions, SHOPPER_ID } from "../helpers.js";

vi.mock("../../src/middleware/auth-token.js", { spy: true });

beforeEach(fakeSessions);

const ORDER_ID = "88888888-8888-4888-8888-888888888888";
const pendingOrder: PendingOrder = {
  orderId: ORDER_ID,
  currency: "usd",
  subtotalCents: 17200,
  lines: [
    {
      productId: "66666666-6666-4666-8666-666666666666",
      slug: "competition-kettlebell",
      name: "Competition Kettlebell",
      imageUrl: null,
      unitPriceCents: 8600,
      quantity: 2,
    },
  ],
};

function fakeCheckout() {
  vi.spyOn(checkoutRepository, "releaseStaleOrders").mockResolvedValue(0);
  const create = vi.spyOn(checkoutRepository, "createPendingOrder").mockResolvedValue(pendingOrder);
  const attach = vi.spyOn(checkoutRepository, "attachSession").mockResolvedValue();
  const cancel = vi.spyOn(checkoutRepository, "cancelPending").mockResolvedValue(true);
  const session = vi
    .spyOn(checkoutGateway, "createSession")
    .mockResolvedValue({ id: "cs_test_abc123", url: "https://checkout.stripe.com/c/pay/cs_test_abc123" } as Stripe.Checkout.Session);
  return { create, attach, cancel, session };
}

describe("POST /checkout/sessions", () => {
  it("reserves the cart and returns Stripe's payment page", async () => {
    const { create, attach, session } = fakeCheckout();

    const res = await api()
      .post("/api/v1/checkout/sessions")
      .send({ items: [{ slug: "competition-kettlebell", quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ sessionId: "cs_test_abc123", url: "https://checkout.stripe.com/c/pay/cs_test_abc123" });
    expect(create).toHaveBeenCalledWith([{ slug: "competition-kettlebell", quantity: 2 }]);
    // A guest: no email to pre-fill, no account to link.
    expect(session).toHaveBeenCalledWith(pendingOrder, null);
    expect(attach).toHaveBeenCalledWith(ORDER_ID, "cs_test_abc123", null);
  });

  it("links the order to a signed-in shopper and pre-fills their email", async () => {
    const { attach, session } = fakeCheckout();

    const res = await api()
      .post("/api/v1/checkout/sessions")
      .set(bearer("shopper-token"))
      .send({ items: [{ slug: "competition-kettlebell", quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(session).toHaveBeenCalledWith(pendingOrder, "sam@example.com");
    expect(attach).toHaveBeenCalledWith(ORDER_ID, "cs_test_abc123", SHOPPER_ID);
  });

  it("still lets a shopper with an expired session check out as a guest", async () => {
    const { attach } = fakeCheckout();

    const res = await api()
      .post("/api/v1/checkout/sessions")
      .set(bearer("expired-token"))
      .send({ items: [{ slug: "competition-kettlebell", quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(attach).toHaveBeenCalledWith(ORDER_ID, "cs_test_abc123", null);
  });

  it("puts the stock back when Stripe fails", async () => {
    const { cancel, session } = fakeCheckout();
    session.mockRejectedValue(new Error("Stripe is down"));

    const res = await api()
      .post("/api/v1/checkout/sessions")
      .send({ items: [{ slug: "competition-kettlebell", quantity: 1 }] });

    expect(res.status).toBe(500);
    expect(cancel).toHaveBeenCalledWith(ORDER_ID);
  });

  it("rejects a cart that tries to set its own price", async () => {
    const { create } = fakeCheckout();

    const res = await api()
      .post("/api/v1/checkout/sessions")
      .send({ items: [{ slug: "competition-kettlebell", quantity: 1, unitPriceCents: 1 }] });

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /checkout/webhook", () => {
  const WEBHOOK_SECRET = "whsec_forgefit_test";

  function signedEvent(event: object) {
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return { payload, signature };
  }

  const completed = {
    id: "evt_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_abc123",
        object: "checkout.session",
        payment_status: "paid",
        client_reference_id: ORDER_ID,
        metadata: { order_id: ORDER_ID },
        payment_intent: "pi_123",
        amount_total: 17200,
        customer_details: { email: "sam@example.com", name: "Sam Shopper" },
      },
    },
  };

  it("records the payment for a correctly signed event", async () => {
    const markPaid = vi.spyOn(checkoutRepository, "markPaid").mockResolvedValue("paid");
    const { payload, signature } = signedEvent(completed);

    const res = await api()
      .post("/api/v1/checkout/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(payload);

    expect(res.status).toBe(200);
    expect(markPaid).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, sessionId: "cs_test_abc123", paymentIntentId: "pi_123", totalCents: 17200 }),
    );
  });

  it("rejects an event that wasn't signed by Stripe", async () => {
    const markPaid = vi.spyOn(checkoutRepository, "markPaid");
    const forged = Stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(completed), secret: "whsec_wrong" });

    const res = await api()
      .post("/api/v1/checkout/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", forged)
      .send(JSON.stringify(completed));

    expect(res.status).toBe(400);
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("rejects a signed event whose body was changed on the way", async () => {
    const markPaid = vi.spyOn(checkoutRepository, "markPaid");
    const { signature } = signedEvent(completed);
    const tampered = JSON.stringify({ ...completed, data: { object: { ...completed.data.object, amount_total: 1 } } });

    const res = await api()
      .post("/api/v1/checkout/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(tampered);

    expect(res.status).toBe(400);
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("releases the stock when a checkout expires", async () => {
    const cancel = vi.spyOn(checkoutRepository, "cancelPending").mockResolvedValue(true);
    const expired = { ...completed, id: "evt_2", type: "checkout.session.expired" };
    const { payload, signature } = signedEvent({
      ...expired,
      data: { object: { ...completed.data.object, payment_status: "unpaid" } },
    });

    const res = await api()
      .post("/api/v1/checkout/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(payload);

    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith(ORDER_ID);
  });
});
