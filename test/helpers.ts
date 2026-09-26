import type { User } from "@supabase/supabase-js";
import request from "supertest";
import { vi } from "vitest";
import { createApp } from "../src/app.js";
import { userFromToken } from "../src/middleware/auth-token.js";

// Test files that call signInAs() must mock the token check first:
//   vi.mock("../../src/middleware/auth-token.js", { spy: true });

export const SHOPPER_ID = "22222222-2222-4222-8222-222222222222";
export const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

const USERS: Record<string, User> = {
  "shopper-token": fakeUser(SHOPPER_ID, "sam@example.com", { full_name: "Sam Shopper" }, {}),
  "admin-token": fakeUser(ADMIN_ID, "admin@example.com", { full_name: "Admin Person" }, { role: "admin" }),
};

function fakeUser(id: string, email: string, userMetadata: object, appMetadata: object): User {
  return {
    id,
    email,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  } as User;
}

/** Makes Supabase Auth accept "shopper-token" and "admin-token"; anything else is rejected. */
export function fakeSessions() {
  vi.mocked(userFromToken).mockImplementation(async (token) => USERS[token] ?? null);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A fresh app per call; supertest binds it to a random port. */
export const api = () => request(createApp());
