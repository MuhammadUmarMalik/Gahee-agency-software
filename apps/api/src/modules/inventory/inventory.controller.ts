import type { Request, Response } from "express";
import { cartonOpenSchema, INVENTORY_MOVEMENT_TYPES, inventoryAdjustmentSchema, inventoryWriteOffSchema, stockCountSchema } from "@oil-agency/shared";
import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import { HttpError } from "../../lib/http-error.js";
import type { InventoryService } from "./inventory.service.js";

function optionalDate(value: unknown) { if (!value) return undefined; const date = new Date(String(value)); if (Number.isNaN(date.valueOf())) throw new HttpError(400, "INVALID_DATE", "Invalid date filter."); return date; }
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  stock = async (req: Request, res: Response) => res.json({ stock: await this.service.stock(String(req.query.search ?? "").trim(), req.query.lowStock === "true", req.query.includeInactive === "true") });
  options = async (_req: Request, res: Response) => res.json({ products: await this.service.options() });
  movements = async (req: Request, res: Response) => { const type = req.query.type ? String(req.query.type) : undefined; if (type && !(INVENTORY_MOVEMENT_TYPES as readonly string[]).includes(type)) throw new HttpError(400, "INVALID_MOVEMENT_TYPE", "Invalid movement type."); res.json(await this.service.movements({ productId: req.query.productId ? String(req.query.productId) : undefined, userId: req.query.userId ? String(req.query.userId) : undefined, type: type as StockMovementType | undefined, from: optionalDate(req.query.from), to: optionalDate(req.query.to), page: Math.max(1, Number(req.query.page) || 1) })); };
  users = async (_req: Request, res: Response) => res.json({ users: await this.service.userSummary() });
  adjust = async (req: Request, res: Response) => res.status(201).json({ movement: await this.service.adjust(inventoryAdjustmentSchema.parse(req.body), req.auth!.id) });
  writeOff = async (req: Request, res: Response) => res.status(201).json({ entry: await this.service.writeOff(inventoryWriteOffSchema.parse(req.body), req.auth!.id) });
  cartonOpen = async (req: Request, res: Response) => res.status(201).json(await this.service.cartonOpen(cartonOpenSchema.parse(req.body), req.auth!.id));
  count = async (req: Request, res: Response) => res.status(201).json({ count: await this.service.physicalCount(stockCountSchema.parse(req.body), req.auth!.id) });
  counts = async (_req: Request, res: Response) => res.json({ counts: await this.service.counts() });
}
