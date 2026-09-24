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

export const notFound = (message = "Resource not found") => new HttpError(404, "not_found", message);

export const internalError = () => new HttpError(500, "internal_error", "Something went wrong");
