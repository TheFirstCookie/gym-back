import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamsSchema } from "../../utils/schemas.js";
import { adminCategoriesController } from "./admin-categories.controller.js";
import { createCategorySchema, updateCategorySchema } from "./admin-categories.schema.js";

// Mounted behind requireAdmin (see routes/index.ts).
export const adminCategoriesRouter = Router();

adminCategoriesRouter.get("/", adminCategoriesController.list);
adminCategoriesRouter.post("/", validate({ body: createCategorySchema }), adminCategoriesController.create);
adminCategoriesRouter.patch(
  "/:id",
  validate({ params: idParamsSchema, body: updateCategorySchema }),
  adminCategoriesController.update,
);
adminCategoriesRouter.delete("/:id", validate({ params: idParamsSchema }), adminCategoriesController.remove);
