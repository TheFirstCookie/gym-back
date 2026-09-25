import { Router } from "express";
import { adminSessionController } from "./admin-session.controller.js";

export const adminSessionRouter = Router();

adminSessionRouter.get("/me", adminSessionController.me);
