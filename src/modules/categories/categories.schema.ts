import { z } from "zod";
import { slugSchema } from "../../utils/schemas.js";

export const categoryParamsSchema = z.object({
  slug: slugSchema,
});

export type CategoryParams = z.infer<typeof categoryParamsSchema>;
