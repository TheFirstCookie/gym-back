import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../../src/lib/supabase.js";
import { adminProductsRepository } from "../../src/modules/admin-products/admin-products.repository.js";
import { checkoutRepository } from "../../src/modules/checkout/checkout.repository.js";
import { productsRepository } from "../../src/modules/products/products.repository.js";
import type { ProductListingRow } from "../../src/modules/products/products.types.js";
import { variantsRepository } from "../../src/modules/variants/variants.repository.js";
import type { VariantRow } from "../../src/modules/variants/variants.types.js";
import { api, bearer, fakeSessions } from "../helpers.js";

vi.mock("../../src/middleware/auth-token.js", { spy: true });

beforeEach(fakeSessions);

const PLATE_ID = "77777777-7777-4777-8777-777777777777";
const SMALL_ID = "a1111111-1111-4111-8111-111111111111";
const LARGE_ID = "a2222222-2222-4222-8222-222222222222";
const HIDDEN_ID = "a3333333-3333-4333-8333-333333333333";

// As the database leaves it: price is the cheapest active variant, stock their total.
const plateRow: ProductListingRow = {
  id: PLATE_ID,
  name: "Bumper Plate",
  slug: "bumper-plate",
  price_cents: 4900,
  currency: "usd",
  stock: 8,
  tag: null,
  image_url: null,
  description: "",
  specs: [],
  sort_order: 0,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  category_id: "c0000000-0000-4000-8000-000000000000",
  category_name: "Strength",
  category_slug: "strength",
  brand_id: "b0000000-0000-4000-8000-000000000000",
  brand_name: "Ironline",
  brand_slug: "ironline",
};

const variant = (id: string, name: string, price: number, stock: number, isActive = true): VariantRow => ({
  id,
  product_id: PLATE_ID,
  name,
  price_cents: price,
  stock,
  is_active: isActive,
});

const plateVariants = [
  variant(SMALL_ID, "10 kg", 4900, 5),
  variant(LARGE_ID, "20 kg", 8900, 3),
  variant(HIDDEN_ID, "25 kg", 10900, 0, false),
];

describe("GET /products/:slug", () => {
  it("lists the variants on sale and the price range", async () => {
    vi.spyOn(productsRepository, "findActiveBySlug").mockResolvedValue(plateRow);
    vi.spyOn(variantsRepository, "listByProduct").mockResolvedValue(new Map([[PLATE_ID, plateVariants]]));

    const res = await api().get("/api/v1/products/bumper-plate");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ hasVariants: true, priceCents: 4900, priceMaxCents: 8900, stock: 8 });
    // The hidden 25 kg isn't for sale.
    expect(res.body.data.variants).toEqual([
      { id: SMALL_ID, name: "10 kg", priceCents: 4900, stock: 5 },
      { id: LARGE_ID, name: "20 kg", priceCents: 8900, stock: 3 },
    ]);
  });

  it("describes a plain product as having no variants", async () => {
    vi.spyOn(productsRepository, "findActiveBySlug").mockResolvedValue(plateRow);
    vi.spyOn(variantsRepository, "listByProduct").mockResolvedValue(new Map());

    const res = await api().get("/api/v1/products/bumper-plate");

    expect(res.body.data).toMatchObject({ hasVariants: false, priceMaxCents: 4900, variants: [] });
  });
});

describe("PUT /admin/products/:id/variants", () => {
  const url = `/api/v1/admin/products/${PLATE_ID}/variants`;
  const body = {
    variants: [
      { id: SMALL_ID, name: "10 kg", priceCents: 4900, stock: 5 },
      { name: "15 kg", priceCents: 6900, stock: 4, isActive: false },
    ],
  };

  it("is for admins only", async () => {
    const save = vi.spyOn(variantsRepository, "save");

    expect((await api().put(url).send(body)).status).toBe(401);
    expect((await api().put(url).set(bearer("shopper-token")).send(body)).status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the list in order and returns the updated product", async () => {
    vi.spyOn(adminProductsRepository, "findById").mockResolvedValue(plateRow);
    vi.spyOn(variantsRepository, "listByProduct").mockResolvedValue(new Map([[PLATE_ID, plateVariants]]));
    const save = vi.spyOn(variantsRepository, "save").mockResolvedValue();

    const res = await api().put(url).set(bearer("admin-token")).send(body);

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledWith(PLATE_ID, [
      { id: SMALL_ID, name: "10 kg", priceCents: 4900, stock: 5, isActive: true },
      { name: "15 kg", priceCents: 6900, stock: 4, isActive: false },
    ]);
    // The admin sees hidden variants too.
    expect(res.body.data.variants).toHaveLength(3);
    expect(res.body.data.variants[2]).toEqual({ id: HIDDEN_ID, name: "25 kg", priceCents: 10900, stock: 0, isActive: false });
  });

  it("rejects two variants with the same name", async () => {
    const save = vi.spyOn(variantsRepository, "save");

    const res = await api()
      .put(url)
      .set(bearer("admin-token"))
      .send({ variants: [{ name: "10 kg", priceCents: 1, stock: 1 }, { name: "10 KG", priceCents: 2, stock: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: "variants.1.name" })]);
    expect(save).not.toHaveBeenCalled();
  });

  it("answers 404 for a product that doesn't exist", async () => {
    vi.spyOn(adminProductsRepository, "findById").mockResolvedValue(null);
    const save = vi.spyOn(variantsRepository, "save");

    const res = await api().put(url).set(bearer("admin-token")).send(body);

    expect(res.status).toBe(404);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("checking out a product with variants", () => {
  // create_pending_order raises these; the storefront needs the exact cart line back.
  function databaseRefuses(error: { code: string; details?: string; hint?: string }) {
    vi.spyOn(checkoutRepository, "releaseStaleOrders").mockResolvedValue(0);
    const rpc = vi.spyOn(supabase, "rpc").mockReturnValue({
      throwOnError: () => Promise.reject({ message: "refused", ...error }),
    } as never);
    return rpc;
  }

  const checkout = (items: object[]) => api().post("/api/v1/checkout/sessions").send({ items });

  it("sends the chosen variant to the database", async () => {
    const rpc = databaseRefuses({ code: "FF004" });

    await checkout([{ slug: "bumper-plate", variant: LARGE_ID, quantity: 2 }]);

    expect(rpc).toHaveBeenCalledWith("create_pending_order", {
      p_items: [{ slug: "bumper-plate", variant: LARGE_ID, quantity: 2 }],
    });
  });

  it("says which variant ran out and how many are left", async () => {
    databaseRefuses({ code: "FF002", details: `bumper-plate:${LARGE_ID}`, hint: "1" });

    const res = await checkout([{ slug: "bumper-plate", variant: LARGE_ID, quantity: 2 }]);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "insufficient_stock",
      details: { slug: "bumper-plate", variant: LARGE_ID, available: 1 },
    });
  });

  it("says which variant is gone", async () => {
    databaseRefuses({ code: "FF001", details: "bumper-plate", hint: HIDDEN_ID });

    const res = await checkout([{ slug: "bumper-plate", variant: HIDDEN_ID, quantity: 1 }]);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "product_unavailable",
      details: { slug: "bumper-plate", variant: HIDDEN_ID },
    });
  });

  it("asks for a variant when a line has none", async () => {
    databaseRefuses({ code: "FF005", details: "bumper-plate" });

    const res = await checkout([{ slug: "bumper-plate", quantity: 1 }]);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "variant_required", details: { slug: "bumper-plate" } });
  });

  it("rejects a variant that isn't an id", async () => {
    const rpc = databaseRefuses({ code: "FF004" });

    const res = await checkout([{ slug: "bumper-plate", variant: "20 kg", quantity: 1 }]);

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
