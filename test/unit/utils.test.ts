import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, toClientError, withClientErrors } from "../../src/utils/db-errors.js";
import { HttpError } from "../../src/utils/http-error.js";
import { paginationQuerySchema, toLimitOffset, toPagination } from "../../src/utils/pagination.js";
import { repeatedQueryParam, searchQuerySchema, slugSchema } from "../../src/utils/schemas.js";
import { toShippingAddress } from "../../src/utils/shipping-address.js";
import { slugify } from "../../src/utils/slugify.js";

describe("slugify", () => {
  it("turns names into URL slugs", () => {
    expect(slugify("Pro Bench 2.0 (Black)")).toBe("pro-bench-2-0-black");
  });

  it("drops accents and trims separators", () => {
    expect(slugify("  Ștangă Olimpică!  ")).toBe("stanga-olimpica");
  });

  it("always produces something the slug schema accepts", () => {
    for (const name of ["Kettlebell 24 kg", "--Mat--", "Café & Co", "a".repeat(300)]) {
      expect(slugSchema.safeParse(slugify(name)).success).toBe(true);
    }
  });
});

describe("pagination", () => {
  it("defaults to the first page of 24", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 24 });
  });

  it("coerces query strings and rejects out-of-range values", () => {
    expect(paginationQuerySchema.parse({ page: "3", pageSize: "10" })).toEqual({ page: 3, pageSize: 10 });
    expect(paginationQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });

  it("converts pages to limit/offset and back to response meta", () => {
    expect(toLimitOffset({ page: 3, pageSize: 10 })).toEqual({ limit: 10, offset: 20 });
    expect(toPagination({ page: 1, pageSize: 10 }, 21)).toEqual({ page: 1, pageSize: 10, total: 21, totalPages: 3 });
    expect(toPagination({ page: 1, pageSize: 10 }, 0).totalPages).toBe(0);
  });
});

describe("query helpers", () => {
  const brands = repeatedQueryParam(slugSchema, 2);

  it("reads a repeated parameter as an array", () => {
    expect(brands.parse(undefined)).toEqual([]);
    expect(brands.parse("ironline")).toEqual(["ironline"]);
    expect(brands.parse(["ironline", "groundwork"])).toEqual(["ironline", "groundwork"]);
    expect(brands.safeParse(["a", "b", "c"]).success).toBe(false);
  });

  it("treats a blank search as no search", () => {
    expect(searchQuerySchema.parse("  kettle  ")).toBe("kettle");
    expect(searchQuerySchema.parse("   ")).toBeUndefined();
  });
});

describe("database errors", () => {
  it("maps constraint violations to client errors", () => {
    expect(toClientError({ code: "23505" }, { unique: "Slug taken" })).toMatchObject({ status: 409, message: "Slug taken" });
    expect(toClientError({ code: "23503" })).toMatchObject({ status: 400 });
    expect(toClientError({ code: "23514" })).toMatchObject({ status: 400 });
    expect(toClientError(new Error("network down"))).toBeNull();
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
  });

  it("rethrows violations from a write as HttpErrors and anything else unchanged", async () => {
    await expect(withClientErrors(Promise.reject({ code: "23505" }))).rejects.toBeInstanceOf(HttpError);
    const boom = new Error("boom");
    await expect(withClientErrors(Promise.reject(boom))).rejects.toBe(boom);
    await expect(withClientErrors(Promise.resolve(42))).resolves.toBe(42);
  });
});

describe("shipping address", () => {
  it("flattens what Stripe collected", () => {
    const address = toShippingAddress({
      name: "Ana Buyer",
      address: { line1: "Str. 1", line2: "", city: "Chisinau", state: null, postal_code: "2000", country: "MD" },
    });
    expect(address).toEqual({
      name: "Ana Buyer",
      line1: "Str. 1",
      line2: null,
      city: "Chisinau",
      state: null,
      postalCode: "2000",
      country: "MD",
    });
  });

  it("returns null when there is no address", () => {
    expect(toShippingAddress(null)).toBeNull();
    expect(toShippingAddress("not an object")).toBeNull();
  });
});
