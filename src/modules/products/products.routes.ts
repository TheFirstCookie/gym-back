import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { productsController } from "./products.controller.js";
import { productListQuerySchema, productParamsSchema, relatedQuerySchema } from "./products.schema.js";

export const productsRouter = Router();

productsRouter.get("/", validate({ query: productListQuerySchema }), productsController.list);
productsRouter.get("/:slug", validate({ params: productParamsSchema }), productsController.getBySlug);
productsRouter.get(
  "/:slug/related",
  validate({ params: productParamsSchema, query: relatedQuerySchema }),
  productsController.listRelated,
);
