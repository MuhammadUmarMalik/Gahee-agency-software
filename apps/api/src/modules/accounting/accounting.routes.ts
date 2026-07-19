import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { AccountingController } from "./accounting.controller.js";
import { AccountingService } from "./accounting.service.js";

export function createAccountingRouter(db: PrismaClient) {
  const router = Router(), controller = new AccountingController(new AccountingService(db));
  router.use(authenticate(db));
  router.get("/accounts", requirePermission(PERMISSIONS.ACCOUNTING_VIEW), controller.accounts);
  router.post("/accounts", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.createAccount);
  router.patch("/accounts/:id", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.updateAccount);
  router.get("/periods", requirePermission(PERMISSIONS.ACCOUNTING_VIEW), controller.periods);
  router.post("/periods", requirePermission(PERMISSIONS.ACCOUNTING_PERIODS), controller.createPeriod);
  router.post("/periods/:id/status", requirePermission(PERMISSIONS.ACCOUNTING_PERIODS), controller.changePeriod);
  router.get("/journals", requirePermission(PERMISSIONS.ACCOUNTING_VIEW), controller.journals);
  router.get("/journals/:id", requirePermission(PERMISSIONS.ACCOUNTING_VIEW), controller.journal);
  router.post("/journals", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.manualJournal);
  router.post("/journals/:id/reverse", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.reverseJournal);
  router.post("/payments/:id/reverse", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.reversePayment);
  router.get("/banks", requirePermission(PERMISSIONS.ACCOUNTING_VIEW), controller.banks);
  router.post("/banks", requirePermission(PERMISSIONS.BANK_ACCOUNTS_MANAGE), controller.createBank);
  router.post("/transactions", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.financialTransaction);
  router.post("/cutover", requirePermission(PERMISSIONS.ACCOUNTING_PERIODS), controller.cutover);
  router.get("/reports/general-ledger/:accountId", requirePermission(PERMISSIONS.FINANCIAL_REPORTS), controller.generalLedger);
  router.get("/reports/cash-in-hand", requirePermission(PERMISSIONS.FINANCIAL_REPORTS), controller.cashInHand);
  router.get("/reports/trial-balance", requirePermission(PERMISSIONS.FINANCIAL_REPORTS), controller.trialBalance);
  router.get("/reports/profit-loss", requirePermission(PERMISSIONS.FINANCIAL_REPORTS), controller.profitAndLoss);
  router.get("/reports/balance-sheet", requirePermission(PERMISSIONS.FINANCIAL_REPORTS), controller.balanceSheet);
  router.get("/reports/cash-flow", requirePermission(PERMISSIONS.FINANCIAL_REPORTS), controller.cashFlow);
  router.get("/reports/receivables-payables", requirePermission(PERMISSIONS.FINANCIAL_REPORTS), controller.receivablesPayables);
  return router;
}
