import { Prisma, type PrismaClient, type Supplier } from "@prisma/client";
import type { CreateSupplierInput, SupplierListQuery, UpdateSupplierInput } from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";
import { minorToMoney } from "../products/product.service.js";
import { signedMoneyToMinor } from "../customers/customer.service.js";
import { AccountingPostingService } from "../accounting/posting.service.js";
import { supplierAging, supplierPayableMinor } from "./supplier-ledger.service.js";

const code = () => `SUP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export class SupplierService {
  constructor(private readonly db: PrismaClient) {}

  async list(query: SupplierListQuery) {
    const where: Prisma.SupplierWhereInput = { deletedAt: null, ...(query.active === "ACTIVE" ? { isActive: true } : query.active === "INACTIVE" ? { isActive: false } : {}), ...(query.search ? { OR: [{ name: { contains: query.search } }, { businessName: { contains: query.search } }, { phone: { contains: query.search } }, { whatsapp: { contains: query.search } }, { code: { contains: query.search } }, { taxIdentifier: { contains: query.search } }] } : {}) };
    const [suppliers, total] = await this.db.$transaction([this.db.supplier.findMany({ where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.db.supplier.count({ where })]);
    const entries = await this.db.supplierLedger.findMany({ where: { supplierId: { in: suppliers.map((supplier) => supplier.id) } }, select: { supplierId: true, debitMinor: true, creditMinor: true, dueDate: true, occurredAt: true } });
    const purchases = await this.db.purchase.groupBy({ by: ["supplierId"], where: { supplierId: { in: suppliers.map((supplier) => supplier.id) } }, _max: { purchasedAt: true } });
    return { suppliers: suppliers.map((supplier) => { const own = entries.filter((entry) => entry.supplierId === supplier.id), age = supplierAging(own); return this.dto(supplier, supplierPayableMinor(own), age.overdueMinor, purchases.find((purchase) => purchase.supplierId === supplier.id)?._max.purchasedAt ?? null); }), pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }

  async get(id: string) {
    const supplier = await this.db.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw new HttpError(404, "SUPPLIER_NOT_FOUND", "Supplier was not found.");
    const entries = await this.db.supplierLedger.findMany({ where: { supplierId: id }, select: { debitMinor: true, creditMinor: true, dueDate: true, occurredAt: true } });
    const age = supplierAging(entries), last = await this.db.purchase.findFirst({ where: { supplierId: id }, orderBy: { purchasedAt: "desc" }, select: { purchasedAt: true } });
    return this.dto(supplier, supplierPayableMinor(entries), age.overdueMinor, last?.purchasedAt ?? null);
  }

  async create(input: CreateSupplierInput, userId: string) {
    const openingBalanceMinor = signedMoneyToMinor(input.openingBalance);
    try {
      return await this.db.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({ data: { code: code(), name: input.name, businessName: input.businessName || null, phone: input.phone || null, whatsapp: input.whatsapp || null, address: input.address || null, taxIdentifier: input.taxIdentifier || null, openingBalanceMinor, isActive: input.isActive } });
        if (openingBalanceMinor !== 0) {
          await tx.supplierLedger.create({ data: { supplierId: supplier.id, entryType: "OPENING_BALANCE", debitMinor: Math.max(0, -openingBalanceMinor), creditMinor: Math.max(0, openingBalanceMinor), sourceType: "SUPPLIER", sourceId: supplier.id, notes: "Opening balance", createdById: userId } });
          await AccountingPostingService.post(tx, { sourceType: "SUPPLIER", sourceId: supplier.id, transactionDate: new Date(), description: `Opening balance - ${supplier.name}`, createdById: userId, lines: openingBalanceMinor > 0 ? [{ systemCode: "OPENING_EQUITY", debitMinor: openingBalanceMinor }, { systemCode: "AP", creditMinor: openingBalanceMinor, supplierId: supplier.id }] : [{ systemCode: "AP", debitMinor: -openingBalanceMinor, supplierId: supplier.id }, { systemCode: "OPENING_EQUITY", creditMinor: -openingBalanceMinor }] });
        }
        await tx.auditLog.create({ data: { userId, action: "CREATE", entityType: "Supplier", entityId: supplier.id, afterJson: JSON.stringify(input) } });
        return this.dto(supplier, openingBalanceMinor, 0, null);
      });
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "DUPLICATE_SUPPLIER", "Supplier code already exists. Try again."); throw error; }
  }

  async update(id: string, input: UpdateSupplierInput, userId: string) {
    const before = await this.db.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new HttpError(404, "SUPPLIER_NOT_FOUND", "Supplier was not found.");
    await this.db.$transaction([this.db.supplier.update({ where: { id }, data: { name: input.name, businessName: input.businessName || null, phone: input.phone || null, whatsapp: input.whatsapp || null, address: input.address || null, taxIdentifier: input.taxIdentifier || null, isActive: input.isActive } }), this.db.auditLog.create({ data: { userId, action: "UPDATE", entityType: "Supplier", entityId: id, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(input) } })]);
    return this.get(id);
  }

  async remove(id: string, userId: string) {
    const supplier = await this.db.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw new HttpError(404, "SUPPLIER_NOT_FOUND", "Supplier was not found.");
    const entries = await this.db.supplierLedger.findMany({ where: { supplierId: id }, select: { debitMinor: true, creditMinor: true } });
    if (supplierPayableMinor(entries) !== 0) throw new HttpError(409, "SUPPLIER_HAS_BALANCE", "A supplier with a non-zero payable balance cannot be deleted.");
    await this.db.$transaction([this.db.supplier.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }), this.db.auditLog.create({ data: { userId, action: "SOFT_DELETE", entityType: "Supplier", entityId: id, beforeJson: JSON.stringify(supplier) } })]);
  }

  async outstanding() {
    const suppliers = await this.db.supplier.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" } });
    const entries = await this.db.supplierLedger.findMany({ where: { supplierId: { in: suppliers.map((supplier) => supplier.id) } }, select: { supplierId: true, debitMinor: true, creditMinor: true, dueDate: true, occurredAt: true } });
    return suppliers.map((supplier) => { const own = entries.filter((entry) => entry.supplierId === supplier.id), age = supplierAging(own); return { id: supplier.id, code: supplier.code, name: supplier.name, businessName: supplier.businessName, phone: supplier.phone, whatsapp: supplier.whatsapp, payable: minorToMoney(supplierPayableMinor(own)), overdue: minorToMoney(age.overdueMinor), earliestDueDate: age.earliestDueDate?.toISOString() ?? null }; }).filter((supplier) => Number(supplier.payable) > 0).sort((a, b) => Number(b.payable) - Number(a.payable));
  }

  private dto(supplier: Supplier, payableMinor: number, overdueMinor: number, lastPurchaseAt: Date | null) { return { ...supplier, openingBalance: minorToMoney(supplier.openingBalanceMinor), payable: minorToMoney(payableMinor), overdue: minorToMoney(overdueMinor), lastPurchaseAt: lastPurchaseAt?.toISOString() ?? null }; }
}
