import { env } from "../config/env.js";
import type { RequestHandler } from "express";
import { forbidden, unauthorized, HttpError } from "../utils/http-error.js";
import { readBearerToken, userFromToken } from "./auth-token.js";

export type AdminUser = {
  id: string;
  email: string | null;
};

const ADMIN_ROLE = "admin";

/**
 * Lets a request through only if it carries a valid Supabase session for an admin.
 *
 * The role lives in the user's app_metadata, which only the service role (the SQL editor
 * or this server) can write, so users can't grant it to themselves. getUser() asks
 * Supabase Auth to validate the token, so revoked sessions and role changes apply
 * immediately rather than when the token expires.
 */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const token = readBearerToken(req.headers.authorization);
  if (!token) throw unauthorized("Sign in to continue");

  const user = await userFromToken(token);
  if (!user) throw unauthorized("Your session has expired, sign in again");

  if (user.app_metadata?.role !== ADMIN_ROLE) {
    throw forbidden("This account doesn't have admin access");
  }

  if (env.ADMIN_REQUIRE_MFA) {
    // getUser above verifies the token before its assurance claim is inspected.
    let assurance: string | undefined;
    try { assurance = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as { aal?: string }).aal; } catch { /* fail closed */ }
    if (assurance !== "aal2") throw new HttpError(403, "mfa_required", "Verify your authenticator code to access admin");
  }
  res.locals.admin = { id: user.id, email: user.email ?? null };
  next();
};
