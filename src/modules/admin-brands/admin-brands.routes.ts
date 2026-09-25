import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamsSchema } from "../../utils/schemas.js";
import { adminBrandsController } from "./admin-brands.controller.js";
import { createBrandSchema, updateBrandSchema } from "./admin-brands.schema.js";

// Mounted behind requireAdmin (see routes/index.ts).
export const adminBrandsRouter = Router();

adminBrandsRouter.get("/", adminBrandsController.list);
adminBrandsRouter.post("/", validate({ body: createBrandSchema }), adminBrandsController.create);
adminBrandsRouter.patch(
  "/:id",
  validate({ params: idParamsSchema, body: updateBrandSchema }),
  adminBrandsController.update,
);
adminBrandsRouter.delete("/:id", validate({ params: idParamsSchema }), adminBrandsController.remove);
