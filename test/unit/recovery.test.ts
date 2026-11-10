import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutGateway as gateway } from "../../src/modules/checkout/checkout.gateway.js";
import { checkoutRepository as repository } from "../../src/modules/checkout/checkout.repository.js";
import { checkoutService as service } from "../../src/modules/checkout/checkout.service.js";
import { email } from "../../src/lib/email.js";
import { orderEmailsRepository } from "../../src/modules/order-emails/order-emails.repository.js";
import { orderEmailsService } from "../../src/modules/order-emails/order-emails.service.js";
import { safeRequestPath } from "../../src/utils/request-path.js";

const session = (status: Stripe.Checkout.Session["status"], payment_status: Stripe.Checkout.Session["payment_status"] = "unpaid") => ({ id: "cs_test_private", status, payment_status, metadata: { order_id: "order" } }) as unknown as Stripe.Checkout.Session;
beforeEach(() => {
  vi.spyOn(gateway, "isConfigured").mockReturnValue(true);
  vi.spyOn(repository, "releaseStaleOrders").mockResolvedValue(0);
  vi.spyOn(repository, "staleLinkedOrders").mockResolvedValue([]);
  vi.spyOn(repository, "pendingRefunds").mockResolvedValue([]);
  vi.spyOn(repository, "checked").mockResolvedValue();
  vi.spyOn(repository, "cancelPending").mockResolvedValue(true);
  vi.spyOn(repository, "attachSession").mockResolvedValue();
  vi.spyOn(repository, "startAttempt").mockResolvedValue();
  vi.spyOn(repository, "recordException").mockResolvedValue();
  vi.spyOn(repository, "markPaid").mockResolvedValue("paid");
  vi.spyOn(orderEmailsService, "sendOrderConfirmation").mockResolvedValue();
});
const staleOrder = { id: "order", stripe_checkout_session_id: "cs_test_private", checkout_started_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", user_id: "owner" };
describe("payment recovery", () => {
  it("records a paid stale session instead of cancelling it", async () => {
    vi.mocked(repository.staleLinkedOrders).mockResolvedValue([staleOrder]);
    vi.spyOn(gateway, "retrieveSession").mockResolvedValue(session("complete", "paid"));
    await service.maintain();
    expect(repository.markPaid).toHaveBeenCalled();
    expect(repository.cancelPending).not.toHaveBeenCalled();
  });
  it("retains a reservation for a completed delayed payment", async () => {
    vi.mocked(repository.staleLinkedOrders).mockResolvedValue([staleOrder]);
    vi.spyOn(gateway, "retrieveSession").mockResolvedValue(session("complete"));
    await service.maintain();
    expect(repository.cancelPending).not.toHaveBeenCalled();
  });
  it("expires an open stale session and releases only confirmed expired sessions", async () => {
    vi.mocked(repository.staleLinkedOrders).mockResolvedValue([staleOrder]);
    vi.spyOn(gateway, "retrieveSession").mockResolvedValue(session("open"));
    vi.spyOn(gateway, "expireSession").mockResolvedValue(session("expired"));
    await service.maintain();
    expect(repository.cancelPending).toHaveBeenCalledWith("order");
  });
  it("retains stock when Stripe cannot be reached during reconciliation", async () => {
    vi.mocked(repository.staleLinkedOrders).mockResolvedValue([staleOrder]);
    vi.spyOn(gateway, "retrieveSession").mockRejectedValue(new Error("offline"));
    await service.maintain();
    expect(repository.cancelPending).not.toHaveBeenCalled();
  });
  it("finds an ambiguous session after a process restart without losing its owner", async () => {
    vi.mocked(repository.staleLinkedOrders).mockResolvedValue([{ ...staleOrder, stripe_checkout_session_id: null }]);
    vi.spyOn(gateway, "findSession").mockResolvedValue(session("complete", "paid"));
    await service.maintain();
    expect(repository.attachSession).toHaveBeenCalledWith("order", "cs_test_private", "owner");
    expect(repository.cancelPending).not.toHaveBeenCalled();
  });
  it("closes a created session even if both attachment attempts would fail", async () => {
    vi.spyOn(repository, "createPendingOrder").mockResolvedValue({ orderId: "order", currency: "usd", subtotalCents: 1, lines: [] });
    vi.spyOn(gateway, "createSession").mockResolvedValue({ ...session("open"), url: "https://checkout.stripe.com/example" });
    vi.mocked(repository.attachSession).mockRejectedValue(new Error("database outage"));
    vi.spyOn(gateway, "expireSession").mockResolvedValue(session("expired"));
    await expect(service.createCheckout([{ slug: "mat", quantity: 1 }])).rejects.toThrow("database outage");
    expect(gateway.expireSession).toHaveBeenCalledWith("cs_test_private");
    expect(repository.cancelPending).toHaveBeenCalledWith("order");
  });
  it("persists an exception and requests retry for a paid order it cannot apply", async () => {
    vi.mocked(repository.markPaid).mockResolvedValue("cancelled");
    await expect(service.handleWebhookEvent({ type: "checkout.session.completed", data: { object: session("complete", "paid") } } as Stripe.Event)).rejects.toMatchObject({ status: 503 });
    expect(repository.recordException).toHaveBeenCalledWith("order", expect.any(String));
  });
  it("records a pending refund without marking it refunded or restocking", async () => {
    vi.spyOn(repository, "beginRefund").mockResolvedValue("attempt-1");
    vi.spyOn(repository, "recordRefund").mockResolvedValue();
    vi.spyOn(repository, "restockRefunded");
    vi.spyOn(gateway, "refundPayment").mockResolvedValue({ id: "re_1", status: "pending" } as Stripe.Refund);
    await service.refundOrder("order", "pi_1", true);
    expect(gateway.refundPayment).toHaveBeenCalledWith("pi_1", "order", "attempt-1");
    expect(repository.recordRefund).toHaveBeenCalledWith("order", "re_1", "pending", "attempt-1");
    expect(repository.restockRefunded).not.toHaveBeenCalled();
  });
  it("recovers a refund webhook that arrives before the payment webhook", async () => {
    vi.spyOn(repository, "refundOrderDetails").mockResolvedValueOnce(null).mockResolvedValue({ id: "order", total_cents: 1000 });
    vi.spyOn(gateway, "sessionForPaymentIntent").mockResolvedValue(session("complete", "paid"));
    vi.spyOn(repository, "recordRefund").mockResolvedValue();
    await service.handleWebhookEvent({ type: "refund.updated", data: { object: { id: "re_early", amount: 1000, status: "succeeded", payment_intent: "pi_early", metadata: {} } } } as Stripe.Event);
    expect(repository.attachSession).toHaveBeenCalledWith("order", "cs_test_private", null);
    expect(repository.markPaid).toHaveBeenCalled();
    expect(repository.recordRefund).toHaveBeenCalledWith("order", "re_early", "succeeded", undefined);
  });
  it("reconciles cumulative partial refunds only after their confirmed total covers the order", async () => {
    vi.spyOn(repository, "refundOrderDetails").mockResolvedValue({ id: "order", total_cents: 1000 });
    vi.spyOn(repository, "recordRefund").mockResolvedValue();
    vi.spyOn(gateway, "fullRefundState").mockResolvedValue({ id: "re_last", status: "succeeded" });
    await service.handleWebhookEvent({ type: "refund.updated", data: { object: { id: "re_last", amount: 400, status: "succeeded", payment_intent: "pi_1", metadata: {} } } } as Stripe.Event);
    expect(gateway.fullRefundState).toHaveBeenCalledWith("pi_1", 1000);
    expect(repository.recordRefund).toHaveBeenCalledWith("order", "re_last", "succeeded");
  });
});
describe("durable email attempts", () => {
  it("schedules provider failures through the outbox independently of webhook retries", async () => {
    vi.mocked(orderEmailsService.sendOrderConfirmation).mockRestore();
    vi.spyOn(email, "isConfigured").mockReturnValue(true);
    vi.spyOn(email, "send").mockRejectedValue(new Error("provider offline"));
    vi.spyOn(orderEmailsRepository, "findOrder").mockResolvedValue({ id: "order", customerEmail: "a@example.test", customerName: null, currency: "usd", subtotalCents: 1000, totalCents: 1000, shippingAddress: null, items: [] });
    vi.spyOn(orderEmailsRepository, "claimConfirmation").mockResolvedValue("claim-1");
    vi.spyOn(orderEmailsRepository, "finishConfirmation").mockResolvedValue();
    await orderEmailsService.sendOrderConfirmation("order");
    expect(email.send).toHaveBeenCalledWith(expect.any(Object), "order-confirmation-order");
    expect(orderEmailsRepository.finishConfirmation).toHaveBeenCalledWith("order", "claim-1", false);
  });
});
it("redacts checkout capabilities and excludes queries from logs", () => {
  expect(safeRequestPath("/api/v1/checkout/sessions/cs_test_private?email=private@example.test")).toBe("/api/v1/checkout/sessions/[checkout]");
});
