import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireUser } from "../../middleware/require-user.js";
import { validate } from "../../middleware/validate.js";
import { idParamsSchema } from "../../utils/schemas.js";
import { adminReviewsController, reviewsController } from "./reviews.controller.js";
import {
  adminReviewListQuerySchema,
  reviewListQuerySchema,
  reviewProductParamsSchema,
  upsertReviewSchema,
} from "./reviews.schema.js";

/** Mounted at /products/:slug/reviews; mergeParams exposes :slug. */
export const reviewsRouter = Router({ mergeParams: true });

const params = validate({ params: reviewProductParamsSchema });

reviewsRouter.get(
  "/",
  validate({ params: reviewProductParamsSchema, query: reviewListQuerySchema }),
  reviewsController.list,
);

// The signed-in customer's own review of this product.
reviewsRouter.get("/mine", requireUser, params, reviewsController.mine);
reviewsRouter.put(
  "/mine",
  rateLimit({ windowMs: 60_000, limit: 20, message: "Too many reviews saved, try again in a minute" }),
  requireUser,
  validate({ params: reviewProductParamsSchema, body: upsertReviewSchema }),
  reviewsController.upsert,
);
reviewsRouter.delete("/mine", requireUser, params, reviewsController.remove);

/** Mounted behind requireAdmin (see routes/index.ts): moderation. */
export const adminReviewsRouter = Router();

adminReviewsRouter.get("/", validate({ query: adminReviewListQuerySchema }), adminReviewsController.list);
adminReviewsRouter.delete("/:id", validate({ params: idParamsSchema }), adminReviewsController.remove);
