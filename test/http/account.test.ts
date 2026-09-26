import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountRepository, type CustomerOrderRow } from "../../src/modules/account/account.repository.js";
import { api, bearer, fakeSessions, SHOPPER_ID } from "../helpers.js";

vi.mock("../../src/middleware/auth-token.js", { spy: true });

beforeEach(fakeSessions);

const ORDER_ID = "55555555-5555-4555-8555-555555555555";
const KETTLEBELL_ID = "66666666-6666-4666-8666-666666666666";

const orderRow: CustomerOrderRow = {
  id: ORDER_ID,
  status: "paid",
  currency: "usd",
  subtotal_cents: 17200,
  total_cents: 17200,
  created_at: "2026-09-25T10:00:00Z",
  paid_at: "2026-09-25T10:01:00Z",
  fulfilled_at: null,
  refunded_at: null,
  shipping_address: { name: "Sam Shopper", address: { line1: "Str. 1", city: "Chisinau", country: "MD" } },
  order_items: [
    { product_id: KETTLEBELL_ID, product_name: "Competition Kettlebell", variant_name: "16 kg", unit_price_cents: 8600, quantity: 2, line_total_cents: 17200 },
    { product_id: null, product_name: "Discontinued Band", variant_name: null, unit_price_cents: 0, quantity: 1, line_total_cents: 0 },
  ],
};

describe("GET /account/orders", () => {
  it("lists only the signed-in shopper's orders, with product links", async () => {
    const listOrders = vi.spyOn(accountRepository, "listOrders").mockResolvedValue([orderRow]);
    vi.spyOn(accountRepository, "productLinks").mockResolvedValue(
      new Map([[KETTLEBELL_ID, { slug: "competition-kettlebell", image: null }]]),
    );

    const res = await api().get("/api/v1/account/orders").set(bearer("shopper-token"));

    expect(res.status).toBe(200);
    expect(listOrders).toHaveBeenCalledWith(SHOPPER_ID, expect.any(Number));
    const [order] = res.body.data;
    expect(order).toMatchObject({ id: ORDER_ID, status: "paid", itemCount: 3, totalCents: 17200 });
    expect(order.shippingAddress).toMatchObject({ name: "Sam Shopper", city: "Chisinau", country: "MD" });
    expect(order.items).toEqual([
      expect.objectContaining({ name: "Competition Kettlebell", variantName: "16 kg", product: { slug: "competition-kettlebell", image: null } }),
      expect.objectContaining({ name: "Discontinued Band", product: null }),
    ]);
  });
});

describe("GET /account/orders/:id", () => {
  it("answers 404 for an order that isn't theirs", async () => {
    const findOrder = vi.spyOn(accountRepository, "findOrder").mockResolvedValue(null);

    const res = await api().get(`/api/v1/account/orders/${ORDER_ID}`).set(bearer("shopper-token"));

    expect(res.status).toBe(404);
    expect(findOrder).toHaveBeenCalledWith(SHOPPER_ID, ORDER_ID);
  });

  it("rejects ids that aren't UUIDs before touching the database", async () => {
    const findOrder = vi.spyOn(accountRepository, "findOrder");
    const res = await api().get("/api/v1/account/orders/1 OR 1=1").set(bearer("shopper-token"));
    expect(res.status).toBe(400);
    expect(findOrder).not.toHaveBeenCalled();
  });
});

describe("wishlist", () => {
  it("saves a product that is in the shop", async () => {
    vi.spyOn(accountRepository, "activeProductId").mockResolvedValue(KETTLEBELL_ID);
    const add = vi.spyOn(accountRepository, "addToWishlist").mockResolvedValue();

    const res = await api().put("/api/v1/account/wishlist/competition-kettlebell").set(bearer("shopper-token"));

    expect(res.status).toBe(204);
    expect(add).toHaveBeenCalledWith(SHOPPER_ID, KETTLEBELL_ID);
  });

  it("answers 404 for a product that doesn't exist", async () => {
    vi.spyOn(accountRepository, "activeProductId").mockResolvedValue(null);
    const add = vi.spyOn(accountRepository, "addToWishlist");

    const res = await api().put("/api/v1/account/wishlist/no-such-thing").set(bearer("shopper-token"));

    expect(res.status).toBe(404);
    expect(add).not.toHaveBeenCalled();
  });

  it("removes a product", async () => {
    const remove = vi.spyOn(accountRepository, "removeFromWishlist").mockResolvedValue();
    const res = await api().delete("/api/v1/account/wishlist/competition-kettlebell").set(bearer("shopper-token"));
    expect(res.status).toBe(204);
    expect(remove).toHaveBeenCalledWith(SHOPPER_ID, "competition-kettlebell");
  });
});
