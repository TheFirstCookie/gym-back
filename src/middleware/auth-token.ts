import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";

/** "Bearer abc" -> "abc"; null when the header is missing or malformed. */
export function readBearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/**
 * Asks Supabase Auth who a session token belongs to. Validating with Auth (instead of only
 * checking the JWT signature) means signed-out and deleted users are rejected immediately.
 * Returns null for a missing, expired or revoked token.
 */
export async function userFromToken(token: string): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}
