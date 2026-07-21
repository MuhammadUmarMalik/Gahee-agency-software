import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { SalesReturnController } from "./sales-return.controller.js";
import { SalesReturnService } from "./sales-return.service.js";

export function createSalesReturnRouter(db: AppDbClient) { const router = Router(); const controller = new SalesReturnController(new SalesReturnService(db)); router.use(authenticate(db), requirePermission(PERMISSIONS.SALES_RETURN)); router.get("/search", controller.search); router.get("/replacement-options", controller.replacements); router.get("/sales/:saleId", controller.sale); router.post("/", controller.create); router.get("/:id", controller.get); router.post("/:id/reverse", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.reverse); return router; }
