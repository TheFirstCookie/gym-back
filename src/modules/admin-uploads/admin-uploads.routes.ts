import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { adminUploadsController } from "./admin-uploads.controller.js";
import { createImageUploadSchema } from "./admin-uploads.schema.js";

// Mounted behind requireAdmin (see routes/index.ts).
export const adminUploadsRouter = Router();

adminUploadsRouter.post(
  "/product-images",
  validate({ body: createImageUploadSchema }),
  adminUploadsController.createProductImageUpload,
);
