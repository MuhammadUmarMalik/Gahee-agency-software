import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { requireRole } from "../../middleware/require-role.js";
import { CashbookService } from "../cashbook/cashbook.service.js";
import { ReportController } from "./report.controller.js";
import { ReportService } from "./report.service.js";

export function createReportRouter(db: AppDbClient) { const router = Router(); const controller = new ReportController(new ReportService(db), new CashbookService(db)); router.use(authenticate(db)); const basic = requirePermission(PERMISSIONS.REPORTS_BASIC); router.get("/options", basic, controller.options); router.get("/sales", basic, controller.sales); router.get("/sales-analysis", basic, controller.salesAnalysis); router.get("/sales-returns", basic, controller.salesReturns); router.get("/inventory", basic, controller.inventory); router.get("/inventory-valuation", basic, controller.inventoryValuation); router.get("/stock-movements", basic, controller.stockMovements); router.get("/write-offs", basic, controller.writeOffs); router.get("/customer-ledgers", basic, controller.customers); const ownerOnly = [requirePermission(PERMISSIONS.REPORTS_SENSITIVE), requireRole("OWNER")]; router.get("/purchases", ...ownerOnly, controller.purchases); router.get("/purchase-analysis", ...ownerOnly, controller.purchaseAnalysis); router.get("/purchase-returns", ...ownerOnly, controller.purchaseReturns); router.get("/supplier-ledgers", ...ownerOnly, controller.suppliers); router.get("/payments", ...ownerOnly, controller.payments); router.get("/financial-summary", ...ownerOnly, controller.financialSummary); router.get("/expenses", ...ownerOnly, controller.expenses); router.get("/cashbook", ...ownerOnly, controller.cashbookReport); router.get("/audit", requirePermission(PERMISSIONS.USERS_MANAGE), requireRole("OWNER"), controller.audit); return router; }
