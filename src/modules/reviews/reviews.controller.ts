import type { Request, Response } from "express";
import type { IdParams } from "../../utils/schemas.js";
import type {
  AdminReviewListQuery,
  ReviewListQuery,
  ReviewProductParams,
  UpsertReviewInput,
} from "./reviews.schema.js";
import { reviewsService } from "./reviews.service.js";

export const reviewsController = {
  async list(req: Request<ReviewProductParams>, res: Response) {
    res.json(await reviewsService.list(req.params.slug, req.query as unknown as ReviewListQuery));
  },

  // The routes below run behind requireUser, so res.locals.user is set.
  async mine(req: Request<ReviewProductParams>, res: Response) {
    res.json({ data: await reviewsService.mine(req.params.slug, res.locals.user!) });
  },

  async upsert(req: Request<ReviewProductParams, unknown, UpsertReviewInput>, res: Response) {
    res.json({ data: await reviewsService.upsert(req.params.slug, res.locals.user!, req.body) });
  },

  async remove(req: Request<ReviewProductParams>, res: Response) {
    await reviewsService.remove(req.params.slug, res.locals.user!);
    res.status(204).end();
  },
};

export const adminReviewsController = {
  async list(req: Request, res: Response) {
    res.json(await reviewsService.listForAdmin(req.query as unknown as AdminReviewListQuery));
  },

  async remove(req: Request<IdParams>, res: Response) {
    await reviewsService.removeAsAdmin(req.params.id);
    res.status(204).end();
  },
};
