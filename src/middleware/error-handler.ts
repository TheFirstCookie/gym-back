import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger.js";
import { HttpError, internalError } from "../utils/http-error.js";

// Shape of errors raised by Express's body parsers (via the http-errors package).
type ExposedClientError = { status: number; expose: true; type?: string; message: string };

const CLIENT_ERROR_CODES: Record<number, string> = {
  413: "payload_too_large",
  415: "unsupported_media_type",
};

function isExposedClientError(err: unknown): err is ExposedClientError {
  if (typeof err !== "object" || err === null) return false;
  const { status, expose } = err as Partial<ExposedClientError>;
  return expose === true && typeof status === "number" && status >= 400 && status < 500;
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  if (isExposedClientError(err)) {
    if (err.type === "entity.parse.failed") {
      return new HttpError(400, "invalid_json", "Request body is not valid JSON");
    }
    return new HttpError(err.status, CLIENT_ERROR_CODES[err.status] ?? "bad_request", err.message);
  }

  return internalError();
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Headers already went out (e.g. mid-stream failure): let Express close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const httpError = toHttpError(err);

  // Unexpected failures are logged in full; the client only ever sees the generic message.
  if (httpError.status >= 500) {
    logger.error("Unhandled error", { method: req.method, path: req.originalUrl, err });
  }

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details !== undefined && { details: httpError.details }),
    },
  });
};
