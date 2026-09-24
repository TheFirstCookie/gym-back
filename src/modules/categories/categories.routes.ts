import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { categoriesController } from "./categories.controller.js";
import { categoryParamsSchema } from "./categories.schema.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", categoriesController.list);
categoriesRouter.get("/:slug", validate({ params: categoryParamsSchema }), categoriesController.getBySlug);
