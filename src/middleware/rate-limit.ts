import { rateLimit as expressRateLimit } from "express-rate-limit";
import { tooManyRequests } from "../utils/http-error.js";

type RateLimitOptions = {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per client IP within the window. */
  limit: number;
  message?: string;
};

/**
 * Per-IP rate limit that answers in the API's usual error shape. Counts live in memory,
 * which is right for a single Render instance; switch to a shared store if it scales out.
 * Relies on app.set("trust proxy", 1) so req.ip is the shopper, not Render's proxy.
 */
export function rateLimit({ windowMs, limit, message }: RateLimitOptions) {
  return expressRateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(tooManyRequests(message)),
  });
}
