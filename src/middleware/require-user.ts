import type { User } from "@supabase/supabase-js";
import type { RequestHandler } from "express";
import { unauthorized } from "../utils/http-error.js";
import { readBearerToken, userFromToken } from "./auth-token.js";

/** A signed-in shopper, as handlers see them. */
export type CustomerUser = {
  id: string;
  email: string | null;
  /** From the name given at sign-up; null if they skipped it. */
  fullName: string | null;
};

function toCustomer(user: User): CustomerUser {
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  return { id: user.id, email: user.email ?? null, fullName: fullName || null };
}

/** Lets a request through only with a valid customer session (any signed-in user). */
export const requireUser: RequestHandler = async (req, res, next) => {
  const token = readBearerToken(req.headers.authorization);
  if (!token) throw unauthorized("Sign in to continue");

  const user = await userFromToken(token);
  if (!user) throw unauthorized("Your session has expired, sign in again");

  res.locals.user = toCustomer(user);
  next();
};

/**
 * For routes that work for guests too (checkout): attaches the user when a valid session
 * is sent, and otherwise carries on as a guest. A bad token is ignored rather than
 * rejected, so an expired session never blocks a purchase.
 */
export const optionalUser: RequestHandler = async (req, res, next) => {
  const token = readBearerToken(req.headers.authorization);
  if (token) {
    const user = await userFromToken(token);
    if (user) res.locals.user = toCustomer(user);
  }
  next();
};
