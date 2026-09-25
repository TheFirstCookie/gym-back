import type { Request, Response } from "express";
import type { ProductListQuery, ProductParams, RelatedQuery } from "./products.schema.js";
import { productsService } from "./products.service.js";

// validate() has already replaced req.query with the parsed schema output; Express's
// own typings still describe it as raw query-string values, hence the casts.
export const productsController = {
  async list(req: Request, res: Response) {
    res.json(await productsService.list(req.query as unknown as ProductListQuery));
  },

  async getBySlug(req: Request<ProductParams>, res: Response) {
    res.json({ data: await productsService.getBySlug(req.params.slug) });
  },

  async listRelated(req: Request<ProductParams>, res: Response) {
    const { limit } = req.query as unknown as RelatedQuery;
    res.json({ data: await productsService.listRelated(req.params.slug, limit) });
  },
};
