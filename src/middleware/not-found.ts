import type { RequestHandler } from "express";
import { notFound } from "../utils/http-error.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.path} not found`));
};
