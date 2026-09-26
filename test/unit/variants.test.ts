import { describe, expect, it } from "vitest";
import { saveVariantsSchema } from "../../src/modules/admin-products/admin-products.schema.js";
import { summarizeVariants } from "../../src/modules/variants/variants.mapper.js";
import type { VariantRow } from "../../src/modules/variants/variants.types.js";
import { byItemName, itemLabel } from "../../src/utils/order-items.js";

const row = (name: string, price: number, isActive = true): VariantRow => ({
  id: name,
  product_id: "p",
  name,
  price_cents: price,
  stock: 1,
  is_active: isActive,
});

describe("summarizeVariants", () => {
  it("gives the most expensive variant on sale", () => {
    expect(summarizeVariants([row("S", 2000), row("M", 2500), row("XL", 9000, false)], 2000)).toEqual({
      hasVariants: true,
      priceMaxCents: 2500,
    });
  });

  it("falls back to the product's own price", () => {
    expect(summarizeVariants([], 1500)).toEqual({ hasVariants: false, priceMaxCents: 1500 });
    // All hidden: still a variant product (it can't be bought on its own), just sold out.
    expect(summarizeVariants([row("S", 2000, false)], 1500)).toEqual({ hasVariants: true, priceMaxCents: 1500 });
  });
});

describe("order line names", () => {
  it("adds the variant in brackets", () => {
    expect(itemLabel("Bumper Plate", "20 kg")).toBe("Bumper Plate (20 kg)");
    expect(itemLabel("Yoga Mat", null)).toBe("Yoga Mat");
  });

  it("sorts by product, then by variant with numbers in order", () => {
    const lines = [
      { name: "Bumper Plate", variantName: "20 kg" },
      { name: "Anvil", variantName: null },
      { name: "Bumper Plate", variantName: "5 kg" },
    ];
    expect(lines.sort(byItemName).map((line) => line.variantName ?? line.name)).toEqual(["Anvil", "5 kg", "20 kg"]);
  });
});

describe("saving variants", () => {
  it("defaults to on sale and trims names", () => {
    expect(saveVariantsSchema.parse({ variants: [{ name: " 10 kg ", priceCents: 4900, stock: 3 }] })).toEqual({
      variants: [{ name: "10 kg", priceCents: 4900, stock: 3, isActive: true }],
    });
  });

  it("accepts an empty list, which removes them all", () => {
    expect(saveVariantsSchema.safeParse({ variants: [] }).success).toBe(true);
  });

  it("rejects bad prices, stock and names", () => {
    const bad = [
      { name: "", priceCents: 1, stock: 1 },
      { name: "S", priceCents: -1, stock: 1 },
      { name: "S", priceCents: 1.5, stock: 1 },
      { name: "S", priceCents: 1, stock: -2 },
      { name: "x".repeat(61), priceCents: 1, stock: 1 },
    ];
    for (const variant of bad) {
      expect(saveVariantsSchema.safeParse({ variants: [variant] }).success).toBe(false);
    }
  });

  it("rejects the same variant twice and more than 30", () => {
    const id = "a1111111-1111-4111-8111-111111111111";
    const twice = [
      { id, name: "S", priceCents: 1, stock: 1 },
      { id, name: "M", priceCents: 1, stock: 1 },
    ];
    expect(saveVariantsSchema.safeParse({ variants: twice }).success).toBe(false);
    const many = Array.from({ length: 31 }, (_, index) => ({ name: `${index}`, priceCents: 1, stock: 1 }));
    expect(saveVariantsSchema.safeParse({ variants: many }).success).toBe(false);
  });
});
