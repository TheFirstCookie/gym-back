import type { RequestHandler } from "express";
import { forbidden, unauthorized } from "../utils/http-error.js";
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

  res.locals.admin = { id: user.id, email: user.email ?? null };
  next();
};
