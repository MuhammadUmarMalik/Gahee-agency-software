import type { Request, Response } from "express";
import { checkoutInputSchema, holdSaleInputSchema, posSearchQuerySchema, reversalInputSchema, saleIdSchema } from "@oil-agency/shared";
import type { SaleService } from "./sale.service.js";

export class SaleController {
  constructor(private readonly service: SaleService) {}
  options = async (_req: Request, res: Response) => res.json(await this.service.options());
  search = async (req: Request, res: Response) => { const query = posSearchQuerySchema.parse(req.query); res.json({ products: await this.service.search(query.search, query.categoryId, query.limit) }); };
  checkout = async (req: Request, res: Response) => res.status(201).json({ sale: await this.service.checkout(checkoutInputSchema.parse(req.body), { id: req.auth!.id, role: req.auth!.role, cashierDiscountLimitBps: req.auth!.cashierDiscountLimitBps }) });
  invoice = async (req: Request, res: Response) => res.json({ sale: await this.service.getInvoice(saleIdSchema.parse(req.params.id)) });
  hold = async (req: Request, res: Response) => res.status(201).json({ hold: await this.service.hold(holdSaleInputSchema.parse(req.body), req.auth!.id) });
  holds = async (req: Request, res: Response) => res.json({ holds: await this.service.holds(req.auth!.id) });
  removeHold = async (req: Request, res: Response) => { await this.service.removeHold(saleIdSchema.parse(req.params.id), req.auth!.id); res.status(204).send(); };
  void = async (req: Request, res: Response) => { const input = reversalInputSchema.parse(req.body); res.json(await this.service.void(saleIdSchema.parse(req.params.id), input.reason, req.auth!.id)); };
}
