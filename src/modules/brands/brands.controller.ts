import type { Request, Response } from "express";
import { brandsService } from "./brands.service.js";

export const brandsController = {
  async list(_req: Request, res: Response) {
    res.json({ data: await brandsService.list() });
  },
};
