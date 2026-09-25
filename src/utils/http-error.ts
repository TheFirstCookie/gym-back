/**
 * An error that maps directly onto an HTTP response.
 * Serialised by the error handler as `{ error: { code, message, details? } }`.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message = "Bad request", details?: unknown) =>
  new HttpError(400, "bad_request", message, details);

export const validationError = (details: unknown) =>
  new HttpError(400, "validation_error", "Request validation failed", details);

export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "unauthorized", message);

export const forbidden = (message = "You don't have access to this resource") =>
  new HttpError(403, "forbidden", message);

export const notFound = (message = "Resource not found") => new HttpError(404, "not_found", message);

export const conflict = (message = "Resource already exists") => new HttpError(409, "conflict", message);

export const tooManyRequests = (message = "Too many requests, try again in a minute") =>
  new HttpError(429, "rate_limited", message);

export const internalError = () => new HttpError(500, "internal_error", "Something went wrong");

export const serviceUnavailable = (code: string, message: string) => new HttpError(503, code, message);
