import type { Request, Response } from "express";
import { z } from "zod";
import { createPurchaseInputSchema, purchaseListQuerySchema, purchasePaymentInputSchema, reversalInputSchema } from "@oil-agency/shared";
import type { PurchaseService } from "./purchase.service.js";

const idSchema = z.string().min(1);
const duplicateSchema = z.object({ supplierId: z.string().min(1), supplierInvoice: z.string().trim().min(1).max(100), excludeId: z.string().min(1).optional() });
export class PurchaseController {
  constructor(private readonly service: PurchaseService) {}
  options = async (_req: Request, res: Response) => res.json(await this.service.options());
  duplicate = async (req: Request, res: Response) => { const query = duplicateSchema.parse(req.query); res.json(await this.service.duplicateInvoice(query.supplierId, query.supplierInvoice, query.excludeId)); };
  list = async (req: Request, res: Response) => res.json(await this.service.list(purchaseListQuerySchema.parse(req.query)));
  get = async (req: Request, res: Response) => res.json({ purchase: await this.service.get(idSchema.parse(req.params.id)) });
  create = async (req: Request, res: Response) => res.status(201).json({ purchase: await this.service.create(createPurchaseInputSchema.parse(req.body), req.auth!.id) });
  update = async (req: Request, res: Response) => res.json({ purchase: await this.service.update(idSchema.parse(req.params.id), createPurchaseInputSchema.parse(req.body), req.auth!.id) });
  pay = async (req: Request, res: Response) => res.status(201).json({ payment: await this.service.pay(idSchema.parse(req.params.id), purchasePaymentInputSchema.parse(req.body), req.auth!.id) });
  void = async (req: Request, res: Response) => { const input = reversalInputSchema.parse(req.body); res.json(await this.service.void(idSchema.parse(req.params.id), input.reason, req.auth!.id)); };
  remove = async (req: Request, res: Response) => { const input = reversalInputSchema.parse(req.body); res.json(await this.service.void(idSchema.parse(req.params.id), input.reason, req.auth!.id)); };
}
