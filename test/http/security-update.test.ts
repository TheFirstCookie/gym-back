import type { User } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import * as auth from "../../src/middleware/auth-token.js";
import { api } from "../helpers.js";
vi.mock("../../src/middleware/auth-token.js", { spy: true });
const originalMfa = env.ADMIN_REQUIRE_MFA;
afterEach(() => { env.ADMIN_REQUIRE_MFA = originalMfa; });
const token = (aal: string) => `header.${Buffer.from(JSON.stringify({ aal })).toString("base64url")}.signature`;
const verifiedUser = { id: "admin", email: "owner@example.test", app_metadata: { role: "admin" }, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" } as User;
it("requires AAL2 for admin calls when MFA enforcement is enabled", async () => {
  env.ADMIN_REQUIRE_MFA = true;
  vi.spyOn(auth, "userFromToken").mockResolvedValue(verifiedUser);
  const result = await api().get("/api/v1/admin/session/me").set("Authorization", `Bearer ${token("aal1")}`);
  expect(result.status).toBe(403);
  expect(result.body.error.code).toBe("mfa_required");
});
it("accepts an admin token only after its verified assurance is AAL2", async () => {
  env.ADMIN_REQUIRE_MFA = true;
  vi.spyOn(auth, "userFromToken").mockResolvedValue(verifiedUser);
  expect((await api().get("/api/v1/admin/session/me").set("Authorization", `Bearer ${token("aal2")}`)).status).toBe(200);
});
it("rejects compressed webhook bodies before parsing or signature verification", async () => {
  const result = await api().post("/api/v1/checkout/webhook")
    .set("Content-Type", "application/json").set("Content-Encoding", "gzip").send("{}");
  expect(result.status).toBe(415);
  expect(result.body.error.code).toBe("unsupported_media_type");
});
