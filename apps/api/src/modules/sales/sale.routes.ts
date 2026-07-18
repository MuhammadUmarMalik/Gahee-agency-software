import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { SaleController } from "./sale.controller.js";
import { SaleService } from "./sale.service.js";

export function createSaleRouter(db: PrismaClient) { const router = Router(), controller = new SaleController(new SaleService(db)); router.use(authenticate(db), requirePermission(PERMISSIONS.POS_USE)); router.get("/options", controller.options); router.get("/search", controller.search); router.get("/holds", controller.holds); router.post("/holds", controller.hold); router.delete("/holds/:id", controller.removeHold); router.get("/sales/:id", controller.invoice); router.post("/sales/:id/void", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.void); router.post("/checkout", controller.checkout); return router; }
