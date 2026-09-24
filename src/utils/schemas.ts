import { z } from "zod";

/** URL slug as stored in the database: lowercase words joined by single hyphens. */
export const slugSchema = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase, hyphen-separated slug");
