import type { RequestHandler } from "express";
import { supabase } from "../lib/supabase.js";
import { forbidden, unauthorized } from "../utils/http-error.js";

export type AdminUser = {
  id: string;
  email: string | null;
};

const ADMIN_ROLE = "admin";

function readBearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

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

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw unauthorized("Your session has expired, sign in again");

  if (data.user.app_metadata?.role !== ADMIN_ROLE) {
    throw forbidden("This account doesn't have admin access");
  }

  res.locals.admin = { id: data.user.id, email: data.user.email ?? null };
  next();
};
