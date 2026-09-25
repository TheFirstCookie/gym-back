import { Router } from "express";
import { requireAdmin } from "../middleware/require-admin.js";
import { adminBrandsRouter } from "../modules/admin-brands/admin-brands.routes.js";
import { adminCategoriesRouter } from "../modules/admin-categories/admin-categories.routes.js";
import { adminDashboardRouter } from "../modules/admin-dashboard/admin-dashboard.routes.js";
import { adminOrdersRouter } from "../modules/admin-orders/admin-orders.routes.js";
import { adminProductsRouter } from "../modules/admin-products/admin-products.routes.js";
import { adminSessionRouter } from "../modules/admin-session/admin-session.routes.js";
import { adminUploadsRouter } from "../modules/admin-uploads/admin-uploads.routes.js";
import { brandsRouter } from "../modules/brands/brands.routes.js";
import { categoriesRouter } from "../modules/categories/categories.routes.js";
import { checkoutRouter } from "../modules/checkout/checkout.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { productsRouter } from "../modules/products/products.routes.js";

/** Admin-only routes. requireAdmin runs once here, so no admin route can forget it. */
const adminRouter = Router();

adminRouter.use(requireAdmin);
adminRouter.use("/session", adminSessionRouter);
adminRouter.use("/dashboard", adminDashboardRouter);
adminRouter.use("/products", adminProductsRouter);
adminRouter.use("/orders", adminOrdersRouter);
adminRouter.use("/categories", adminCategoriesRouter);
adminRouter.use("/brands", adminBrandsRouter);
adminRouter.use("/uploads", adminUploadsRouter);

/** Every versioned API route; mounted at /api/v1 in app.ts. */
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/brands", brandsRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/checkout", checkoutRouter);
apiRouter.use("/admin", adminRouter);
