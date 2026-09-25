import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { adminDashboardController } from "./admin-dashboard.controller.js";
import { dashboardQuerySchema } from "./admin-dashboard.schema.js";

// Mounted behind requireAdmin (see routes/index.ts).
export const adminDashboardRouter = Router();

adminDashboardRouter.get("/", validate({ query: dashboardQuerySchema }), adminDashboardController.get);
