import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const optionalId = z.string().cuid().optional();
export const reportDateFilterSchema = z.object({
  from: date,
  to: date,
  customerId: optionalId,
  supplierId: optionalId,
  productId: optionalId,
  categoryId: optionalId,
  brandId: optionalId,
  userId: optionalId,
  paymentStatus: z.enum(["PAID", "PARTIAL", "UNPAID"]).optional(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]).optional(),
}).refine((value) => value.from <= value.to, { path: ["to"], message: "End date cannot be before start date." });
export const inventoryReportFilterSchema = z.object({ productId: optionalId, categoryId: optionalId, brandId: optionalId, nearExpiryDays: z.coerce.number().int().min(1).max(365).default(30) });
export const ledgerReportFilterSchema = z.object({ from: date, to: date, customerId: optionalId, supplierId: optionalId }).refine((value) => value.from <= value.to, { path: ["to"], message: "End date cannot be before start date." });
export const auditReportFilterSchema = z.object({
  from: date,
  to: date,
  userId: optionalId,
  action: z.enum(["INITIAL_SETUP", "CREATE", "UPDATE", "SOFT_DELETE", "ACTIVATE", "DEACTIVATE", "RESET_PASSWORD", "POST", "VOID", "BACKUP", "RESTORE", "REVERSE", "CLOSE", "REOPEN"]).optional(),
  entityType: z.string().trim().max(80).optional(),
}).refine((value) => value.from <= value.to, { path: ["to"], message: "End date cannot be before start date." });
export type ReportDateFilter = z.infer<typeof reportDateFilterSchema>;
export type InventoryReportFilter = z.infer<typeof inventoryReportFilterSchema>;
export type LedgerReportFilter = z.infer<typeof ledgerReportFilterSchema>;
export type AuditReportFilter = z.infer<typeof auditReportFilterSchema>;
