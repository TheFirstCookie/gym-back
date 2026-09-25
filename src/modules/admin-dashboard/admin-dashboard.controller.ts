import type { Request, Response } from "express";
import type { DashboardQuery } from "./admin-dashboard.schema.js";
import { adminDashboardService } from "./admin-dashboard.service.js";

export const adminDashboardController = {
  async get(req: Request, res: Response) {
    res.json({ data: await adminDashboardService.get(req.query as unknown as DashboardQuery) });
  },
};
