import type { Request, Response } from "express";
import type { IdParams } from "../../utils/schemas.js";
import type { AdminOrderListQuery, RefundOrderInput, UpdateOrderInput } from "./admin-orders.schema.js";
import { adminOrdersService } from "./admin-orders.service.js";

// Bodies and queries arrive already parsed by validate(); see products.controller.ts.
export const adminOrdersController = {
  async list(req: Request, res: Response) {
    res.json(await adminOrdersService.list(req.query as unknown as AdminOrderListQuery));
  },

  async getById(req: Request<IdParams>, res: Response) {
    res.json({ data: await adminOrdersService.getById(req.params.id) });
  },

  async update(req: Request<IdParams, unknown, UpdateOrderInput>, res: Response) {
    res.json({ data: await adminOrdersService.updateStatus(req.params.id, req.body) });
  },

  async refund(req: Request<IdParams, unknown, RefundOrderInput>, res: Response) {
    res.json({ data: await adminOrdersService.refund(req.params.id, req.body) });
  },

  async restock(req: Request<IdParams>, res: Response) {
    res.json({ data: await adminOrdersService.restock(req.params.id) });
  },
};
