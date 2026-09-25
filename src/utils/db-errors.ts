import { badRequest, conflict, type HttpError } from "./http-error.js";

// Postgres error codes (https://www.postgresql.org/docs/current/errcodes-appendix.html)
// that mean "the client sent bad data" rather than "the server broke".
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

type DbError = { code?: string };

/**
 * Translates a constraint violation into a 4xx the client can act on.
 * Returns null for anything else, which should surface as a 500.
 */
export function toClientError(error: unknown, messages: { unique?: string; foreignKey?: string } = {}): HttpError | null {
  const code = (error as DbError | null)?.code;

  switch (code) {
    case UNIQUE_VIOLATION:
      return conflict(messages.unique);
    case FOREIGN_KEY_VIOLATION:
      return badRequest(messages.foreignKey ?? "A referenced record doesn't exist");
    case CHECK_VIOLATION:
      return badRequest("A value is outside the allowed range");
    default:
      return null;
  }
}

/** Awaits a database write and rethrows constraint violations as client errors. */
export async function withClientErrors<T>(
  operation: PromiseLike<T>,
  messages?: Parameters<typeof toClientError>[1],
): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw toClientError(error, messages) ?? error;
  }
}
