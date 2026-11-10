import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/** Log route structure; never log capability IDs or user-supplied query strings. */
export function safeRequestPath(path: string) {
  return path.split("?")[0]!.replace(/cs_(?:test|live)_[^/]+/g, "[checkout]")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]");
}
export const requestId: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Request-Id", randomUUID());
  next();
};
