import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
export function createDashboardRouter(db: AppDbClient) { const router = Router(); const controller = new DashboardController(new DashboardService(db)); router.use(authenticate(db), requirePermission(PERMISSIONS.DASHBOARD_VIEW)); router.get("/", controller.get); return router; }
