import type { Request, Response } from "express";
import type { CategoryParams } from "./categories.schema.js";
import { categoriesService } from "./categories.service.js";

// Express 5 forwards rejected promises to the error handler, so no try/catch here.
export const categoriesController = {
  async list(_req: Request, res: Response) {
    res.json({ data: await categoriesService.list() });
  },

  async getBySlug(req: Request<CategoryParams>, res: Response) {
    res.json({ data: await categoriesService.getBySlug(req.params.slug) });
  },
};
