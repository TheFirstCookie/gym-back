import type { Request, Response } from "express";
import type { CreateImageUploadInput } from "./admin-uploads.schema.js";
import { adminUploadsService } from "./admin-uploads.service.js";

export const adminUploadsController = {
  async createProductImageUpload(req: Request<unknown, unknown, CreateImageUploadInput>, res: Response) {
    res.status(201).json({ data: await adminUploadsService.createProductImageUpload(req.body) });
  },
};
