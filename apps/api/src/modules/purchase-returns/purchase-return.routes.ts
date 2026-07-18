import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { PurchaseReturnController } from "./purchase-return.controller.js";
import { PurchaseReturnService } from "./purchase-return.service.js";
export function createPurchaseReturnRouter(db: PrismaClient) { const router = Router(), controller = new PurchaseReturnController(new PurchaseReturnService(db)); router.use(authenticate(db), requirePermission(PERMISSIONS.PURCHASES_MANAGE)); router.get("/", controller.list); router.get("/purchase/:id", controller.original); router.get("/:id", controller.get); router.post("/", controller.create); router.post("/:id/reverse", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.reverse); return router; }
