import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamsSchema } from "../../utils/schemas.js";
import { adminOrdersController } from "./admin-orders.controller.js";
import { adminOrderListQuerySchema, updateOrderSchema } from "./admin-orders.schema.js";

// Mounted behind requireAdmin (see routes/index.ts).
export const adminOrdersRouter = Router();

adminOrdersRouter.get("/", validate({ query: adminOrderListQuerySchema }), adminOrdersController.list);
adminOrdersRouter.get("/:id", validate({ params: idParamsSchema }), adminOrdersController.getById);
adminOrdersRouter.patch(
  "/:id",
  validate({ params: idParamsSchema, body: updateOrderSchema }),
  adminOrdersController.update,
);
