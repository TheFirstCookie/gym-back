import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminReviewsController } from "../../src/modules/reviews/reviews.controller.js";
import { reviewsRepository } from "../../src/modules/reviews/reviews.repository.js";
import { api, bearer, fakeSessions } from "../helpers.js";

vi.mock("../../src/middleware/auth-token.js", { spy: true });

beforeEach(fakeSessions);

describe("shopper routes", () => {
  it("need a session", async () => {
    const res = await api().get("/api/v1/account/orders");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("reject an expired or made-up token", async () => {
    const res = await api().get("/api/v1/account/wishlist").set(bearer("expired-token"));
    expect(res.status).toBe(401);
  });

  it("reject a malformed Authorization header", async () => {
    const res = await api().get("/api/v1/account/orders").set("Authorization", "Token shopper-token");
    expect(res.status).toBe(401);
  });
});

describe("admin routes", () => {
  it("need a session", async () => {
    expect((await api().get("/api/v1/admin/session/me")).status).toBe(401);
  });

  it("refuse signed-in shoppers", async () => {
    const res = await api().get("/api/v1/admin/session/me").set(bearer("shopper-token"));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("refuse shoppers on every admin route, before any handler runs", async () => {
    const remove = vi.spyOn(adminReviewsController, "remove");
    const deleteById = vi.spyOn(reviewsRepository, "deleteById");

    const res = await api()
      .delete("/api/v1/admin/reviews/44444444-4444-4444-8444-444444444444")
      .set(bearer("shopper-token"));

    expect(res.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
    expect(deleteById).not.toHaveBeenCalled();
  });

  it("let admins in", async () => {
    const res = await api().get("/api/v1/admin/session/me").set(bearer("admin-token"));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: "admin@example.com" });
  });
});
