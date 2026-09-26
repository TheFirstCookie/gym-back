import { describe, expect, it, vi } from "vitest";
import { healthRepository } from "../../src/modules/health/health.repository.js";
import { api } from "../helpers.js";

describe("error responses", () => {
  it("answers unknown routes with the API's error shape", async () => {
    const res = await api().get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: expect.any(String) } });
  });

  it("reports malformed JSON as a 400, not a crash", async () => {
    const res = await api()
      .post("/api/v1/checkout/sessions")
      .set("Content-Type", "application/json")
      .send('{"items": [');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_json");
  });

  it("lists every validation problem with where it was found", async () => {
    const res = await api().get("/api/v1/products?pageSize=500&sort=cheapest");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: "query", path: "pageSize" }),
        expect.objectContaining({ location: "query", path: "sort" }),
      ]),
    );
  });
});

describe("GET /health", () => {
  it("is ok while the database answers", async () => {
    vi.spyOn(healthRepository, "pingDatabase").mockResolvedValue(true);
    const res = await api().get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "ok", db: "up" });
  });

  it("stays 200 but says degraded when the database is down", async () => {
    vi.spyOn(healthRepository, "pingDatabase").mockResolvedValue(false);
    const res = await api().get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "degraded", db: "down" });
  });
});

describe("security headers and CORS", () => {
  it("allows the storefront's origin and no other", async () => {
    vi.spyOn(healthRepository, "pingDatabase").mockResolvedValue(true);
    const allowed = await api().get("/api/v1/health").set("Origin", "http://localhost:3000");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");

    const other = await api().get("/api/v1/health").set("Origin", "https://evil.example");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends helmet's headers", async () => {
    vi.spyOn(healthRepository, "pingDatabase").mockResolvedValue(true);
    const res = await api().get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
