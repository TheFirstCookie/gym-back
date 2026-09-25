import { Router } from "express";
import { requireAdmin } from "../middleware/require-admin.js";
import { adminProductsRouter } from "../modules/admin-products/admin-products.routes.js";
import { adminSessionRouter } from "../modules/admin-session/admin-session.routes.js";
import { adminUploadsRouter } from "../modules/admin-uploads/admin-uploads.routes.js";
import { brandsRouter } from "../modules/brands/brands.routes.js";
import { categoriesRouter } from "../modules/categories/categories.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { productsRouter } from "../modules/products/products.routes.js";

/** Admin-only routes. requireAdmin runs once here, so no admin route can forget it. */
const adminRouter = Router();

adminRouter.use(requireAdmin);
adminRouter.use("/session", adminSessionRouter);
adminRouter.use("/products", adminProductsRouter);
adminRouter.use("/uploads", adminUploadsRouter);

/** Every versioned API route; mounted at /api/v1 in app.ts. */
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/brands", brandsRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/admin", adminRouter);
