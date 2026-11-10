import type { RequestHandler } from "express";
import { safeRequestPath } from "../utils/request-path.js";
import { logger } from "../lib/logger.js";

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();

  res.on("finish", () => {
    const level = res.statusCode >= 400 ? "warn" : "info";
    logger[level](`${req.method} ${safeRequestPath(req.path)} ${res.statusCode}`, {
      requestId: res.getHeader("X-Request-Id"),
      durationMs: Math.round(performance.now() - startedAt),
    });
  });

  next();
};
