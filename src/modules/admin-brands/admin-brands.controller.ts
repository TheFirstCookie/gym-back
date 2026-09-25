import type { Request, Response } from "express";
import type { IdParams } from "../../utils/schemas.js";
import type { CreateBrandInput, UpdateBrandInput } from "./admin-brands.schema.js";
import { adminBrandsService } from "./admin-brands.service.js";

export const adminBrandsController = {
  async list(_req: Request, res: Response) {
    res.json({ data: await adminBrandsService.list() });
  },

  async create(req: Request<unknown, unknown, CreateBrandInput>, res: Response) {
    res.status(201).json({ data: await adminBrandsService.create(req.body) });
  },

  async update(req: Request<IdParams, unknown, UpdateBrandInput>, res: Response) {
    res.json({ data: await adminBrandsService.update(req.params.id, req.body) });
  },

  async remove(req: Request<IdParams>, res: Response) {
    await adminBrandsService.remove(req.params.id);
    res.status(204).end();
  },
};
