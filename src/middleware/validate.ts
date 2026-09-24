import type { RequestHandler } from "express";
import type { z } from "zod";
import { validationError } from "../utils/http-error.js";

type RequestSchemas = {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
};

type ValidationIssue = {
  location: keyof RequestSchemas;
  path: string;
  message: string;
};

const LOCATIONS = ["params", "query", "body"] as const;

/**
 * Validates and coerces request parts with zod. Parsed values replace the originals,
 * so handlers read already-typed, already-transformed input.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(req[location]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ location, path: issue.path.map(String).join("."), message: issue.message });
        }
        continue;
      }

      // Express 5 exposes req.query as a getter, so redefine instead of assigning.
      Object.defineProperty(req, location, {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    next(issues.length > 0 ? validationError(issues) : undefined);
  };
}
