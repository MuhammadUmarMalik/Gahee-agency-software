import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { requireRole } from "../../middleware/require-role.js";
import { CashbookService } from "../cashbook/cashbook.service.js";
import { ReportController } from "./report.controller.js";
import { ReportService } from "./report.service.js";

export function createReportRouter(db: PrismaClient) { const router = Router(); const controller = new ReportController(new ReportService(db), new CashbookService(db)); router.use(authenticate(db)); router.get("/options", requirePermission(PERMISSIONS.REPORTS_BASIC), controller.options); router.get("/sales", requirePermission(PERMISSIONS.REPORTS_BASIC), controller.sales); router.get("/inventory", requirePermission(PERMISSIONS.REPORTS_BASIC), controller.inventory); router.get("/write-offs", requirePermission(PERMISSIONS.REPORTS_BASIC), controller.writeOffs); router.get("/customer-ledgers", requirePermission(PERMISSIONS.REPORTS_BASIC), controller.customers); const ownerOnly = [requirePermission(PERMISSIONS.REPORTS_SENSITIVE), requireRole("OWNER")]; router.get("/purchases", ...ownerOnly, controller.purchases); router.get("/supplier-ledgers", ...ownerOnly, controller.suppliers); router.get("/expenses", ...ownerOnly, controller.expenses); router.get("/cashbook", ...ownerOnly, controller.cashbookReport); return router; }
