import type { Request, Response } from "express";
import type { IdParams } from "../../utils/schemas.js";
import type {
  AdminProductListQuery,
  CreateProductInput,
  UpdateProductInput,
} from "./admin-products.schema.js";
import { adminProductsService } from "./admin-products.service.js";

// Bodies and queries arrive already parsed by validate(); see products.controller.ts.
export const adminProductsController = {
  async list(req: Request, res: Response) {
    res.json(await adminProductsService.list(req.query as unknown as AdminProductListQuery));
  },

  async getById(req: Request<IdParams>, res: Response) {
    res.json({ data: await adminProductsService.getById(req.params.id) });
  },

  async create(req: Request<unknown, unknown, CreateProductInput>, res: Response) {
    const product = await adminProductsService.create(req.body);
    res.status(201).json({ data: product });
  },

  async update(req: Request<IdParams, unknown, UpdateProductInput>, res: Response) {
    res.json({ data: await adminProductsService.update(req.params.id, req.body) });
  },

  async archive(req: Request<IdParams>, res: Response) {
    await adminProductsService.archive(req.params.id);
    res.status(204).end();
  },
};
