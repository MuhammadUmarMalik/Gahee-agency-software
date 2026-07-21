import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { CashbookController } from "./cashbook.controller.js";
import { CashbookService } from "./cashbook.service.js";
export function createCashbookRouter(db: AppDbClient) { const router = Router(); const controller = new CashbookController(new CashbookService(db)); router.use(authenticate(db)); router.get("/users", requirePermission(PERMISSIONS.CASHBOOK_VIEW), controller.users); router.get("/report", requirePermission(PERMISSIONS.CASHBOOK_VIEW), controller.report); router.get("/day/:date", requirePermission(PERMISSIONS.CASHBOOK_VIEW), controller.day); router.post("/entries", requirePermission(PERMISSIONS.CASHBOOK_MANAGE), controller.create); router.post("/closings", requirePermission(PERMISSIONS.CASHBOOK_CLOSE), controller.close); return router; }
