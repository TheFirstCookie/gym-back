import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamsSchema } from "../../utils/schemas.js";
import { adminProductsController } from "./admin-products.controller.js";
import {
  adminProductListQuerySchema,
  createProductSchema,
  updateProductSchema,
} from "./admin-products.schema.js";

// Mounted behind requireAdmin (see routes/index.ts).
export const adminProductsRouter = Router();

adminProductsRouter.get("/", validate({ query: adminProductListQuerySchema }), adminProductsController.list);
adminProductsRouter.post("/", validate({ body: createProductSchema }), adminProductsController.create);
adminProductsRouter.get("/:id", validate({ params: idParamsSchema }), adminProductsController.getById);
adminProductsRouter.patch(
  "/:id",
  validate({ params: idParamsSchema, body: updateProductSchema }),
  adminProductsController.update,
);
adminProductsRouter.delete("/:id", validate({ params: idParamsSchema }), adminProductsController.archive);
