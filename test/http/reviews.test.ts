import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewsRepository } from "../../src/modules/reviews/reviews.repository.js";
import type { Review } from "../../src/modules/reviews/reviews.types.js";
import { api, bearer, fakeSessions, SHOPPER_ID } from "../helpers.js";

vi.mock("../../src/middleware/auth-token.js", { spy: true });

beforeEach(fakeSessions);

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const review: Review = {
  id: "77777777-7777-4777-8777-777777777777",
  rating: 5,
  title: "Solid bell",
  body: "Great handle.",
  authorName: "Sam S.",
  verifiedPurchase: true,
  createdAt: "2026-09-25T10:00:00Z",
  updatedAt: "2026-09-25T10:00:00Z",
};

describe("GET /products/:slug/reviews", () => {
  it("is public and returns the page with the rating summary", async () => {
    vi.spyOn(reviewsRepository, "productIdBySlug").mockResolvedValue(PRODUCT_ID);
    vi.spyOn(reviewsRepository, "summary").mockResolvedValue({ count: 12, average: 4.5, distribution: [0, 1, 1, 2, 8] });
    const list = vi.spyOn(reviewsRepository, "list").mockResolvedValue([review]);

    const res = await api().get("/api/v1/products/competition-kettlebell/reviews?page=2&pageSize=5");

    expect(res.status).toBe(200);
    expect(list).toHaveBeenCalledWith(PRODUCT_ID, 5, 5);
    expect(res.body.data).toEqual([review]);
    expect(res.body.meta).toEqual({
      pagination: { page: 2, pageSize: 5, total: 12, totalPages: 3 },
      summary: { count: 12, average: 4.5, distribution: [0, 1, 1, 2, 8] },
    });
  });

  it("answers 404 for products that aren't in the shop", async () => {
    vi.spyOn(reviewsRepository, "productIdBySlug").mockResolvedValue(null);
    expect((await api().get("/api/v1/products/hidden-thing/reviews")).status).toBe(404);
  });
});

describe("PUT /products/:slug/reviews/mine", () => {
  it("needs a session", async () => {
    const res = await api().put("/api/v1/products/competition-kettlebell/reviews/mine").send({ rating: 5 });
    expect(res.status).toBe(401);
  });

  it("validates the rating", async () => {
    const res = await api()
      .put("/api/v1/products/competition-kettlebell/reviews/mine")
      .set(bearer("shopper-token"))
      .send({ rating: 7 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ location: "body", path: "rating" });
  });

  it("saves the review under the signed-in shopper", async () => {
    vi.spyOn(reviewsRepository, "productIdBySlug").mockResolvedValue(PRODUCT_ID);
    vi.spyOn(reviewsRepository, "hasPurchased").mockResolvedValue(true);
    vi.spyOn(reviewsRepository, "findByAuthor").mockResolvedValueOnce(null).mockResolvedValue(review);
    const insert = vi.spyOn(reviewsRepository, "insert").mockResolvedValue();

    const res = await api()
      .put("/api/v1/products/competition-kettlebell/reviews/mine")
      .set(bearer("shopper-token"))
      .send({ rating: 5, title: "Solid bell", body: "Great handle." });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(review);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: SHOPPER_ID, author_name: "Sam S.", verified_purchase: true }),
    );
  });
});

describe("DELETE /admin/reviews/:id", () => {
  it("removes a review", async () => {
    const deleteById = vi.spyOn(reviewsRepository, "deleteById").mockResolvedValue(true);
    const res = await api().delete(`/api/v1/admin/reviews/${review.id}`).set(bearer("admin-token"));
    expect(res.status).toBe(204);
    expect(deleteById).toHaveBeenCalledWith(review.id);
  });

  it("answers 404 when it's already gone", async () => {
    vi.spyOn(reviewsRepository, "deleteById").mockResolvedValue(false);
    const res = await api().delete(`/api/v1/admin/reviews/${review.id}`).set(bearer("admin-token"));
    expect(res.status).toBe(404);
  });
});
