import { describe, expect, it, vi } from "vitest";
import { reviewsRepository } from "../../src/modules/reviews/reviews.repository.js";
import { displayName, reviewsService } from "../../src/modules/reviews/reviews.service.js";
import type { Review } from "../../src/modules/reviews/reviews.types.js";

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const shopper = { id: "user-1", email: "ana@example.com", fullName: "Ana Maria Buyer" };

const saved: Review = {
  id: "review-1",
  rating: 4,
  title: null,
  body: "",
  authorName: "Ana B.",
  verifiedPurchase: true,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
};

describe("displayName", () => {
  it("shows the first name and last initial, never the email", () => {
    expect(displayName("Ana Maria Buyer")).toBe("Ana B.");
    expect(displayName("  sam  ")).toBe("sam");
    expect(displayName("sam shopper")).toBe("sam S.");
  });

  it("falls back to a neutral label without a name", () => {
    expect(displayName(null)).toBe("ForgeFit customer");
    expect(displayName("   ")).toBe("ForgeFit customer");
  });
});

describe("reviewsService.upsert", () => {
  function fakeRepository({ existing, purchased }: { existing: Review | null; purchased: boolean }) {
    vi.spyOn(reviewsRepository, "productIdBySlug").mockResolvedValue(PRODUCT_ID);
    vi.spyOn(reviewsRepository, "hasPurchased").mockResolvedValue(purchased);
    vi.spyOn(reviewsRepository, "findByAuthor").mockResolvedValueOnce(existing).mockResolvedValue(saved);
    return {
      insert: vi.spyOn(reviewsRepository, "insert").mockResolvedValue(),
      update: vi.spyOn(reviewsRepository, "update").mockResolvedValue(),
    };
  }

  it("creates a review with the author name and purchase badge worked out on the server", async () => {
    const { insert, update } = fakeRepository({ existing: null, purchased: true });

    await reviewsService.upsert("competition-kettlebell", shopper, { rating: 4, title: null, body: "" });

    expect(update).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith({
      product_id: PRODUCT_ID,
      user_id: "user-1",
      author_name: "Ana B.",
      rating: 4,
      title: null,
      body: "",
      verified_purchase: true,
    });
  });

  it("replaces the shopper's earlier review instead of adding a second one", async () => {
    const { insert, update } = fakeRepository({ existing: saved, purchased: false });

    await reviewsService.upsert("competition-kettlebell", shopper, { rating: 2, title: "Changed my mind", body: "" });

    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(PRODUCT_ID, "user-1", expect.objectContaining({ rating: 2, verified_purchase: false }));
  });

  it("answers 404 for a product that isn't in the shop", async () => {
    vi.spyOn(reviewsRepository, "productIdBySlug").mockResolvedValue(null);
    await expect(reviewsService.upsert("gone", shopper, { rating: 5, title: null, body: "" })).rejects.toMatchObject({
      status: 404,
    });
  });
});
