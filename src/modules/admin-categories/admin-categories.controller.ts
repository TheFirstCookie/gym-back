import type { Request, Response } from "express";
import type { IdParams } from "../../utils/schemas.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "./admin-categories.schema.js";
import { adminCategoriesService } from "./admin-categories.service.js";

export const adminCategoriesController = {
  async list(_req: Request, res: Response) {
    res.json({ data: await adminCategoriesService.list() });
  },

  async create(req: Request<unknown, unknown, CreateCategoryInput>, res: Response) {
    res.status(201).json({ data: await adminCategoriesService.create(req.body) });
  },

  async update(req: Request<IdParams, unknown, UpdateCategoryInput>, res: Response) {
    res.json({ data: await adminCategoriesService.update(req.params.id, req.body) });
  },

  async remove(req: Request<IdParams>, res: Response) {
    await adminCategoriesService.remove(req.params.id);
    res.status(204).end();
  },
};
