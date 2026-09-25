import { z } from "zod";
import { slugSchema } from "../../utils/schemas.js";

export const wishlistParamsSchema = z.object({
  slug: slugSchema,
});

export type WishlistParams = z.infer<typeof wishlistParamsSchema>;
