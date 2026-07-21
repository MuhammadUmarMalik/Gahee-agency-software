import type { Request, Response } from "express";
import { checkoutInputSchema, holdSaleInputSchema, posSearchQuerySchema, reversalInputSchema, saleIdSchema, saleListQuerySchema, updateSaleMetadataInputSchema } from "@oil-agency/shared";
import type { SaleService } from "./sale.service.js";

export class SaleController {
  constructor(private readonly service: SaleService) {}
  options = async (_req: Request, res: Response) => res.json(await this.service.options());
  search = async (req: Request, res: Response) => { const query = posSearchQuerySchema.parse(req.query); res.json({ products: await this.service.search(query.search, query.categoryId, query.limit) }); };
  list = async (req: Request, res: Response) => res.json(await this.service.list(saleListQuerySchema.parse(req.query)));
  checkout = async (req: Request, res: Response) => {
    const sale = await this.service.checkout(checkoutInputSchema.parse(req.body), { id: req.auth!.id, role: req.auth!.role, cashierDiscountLimitBps: req.auth!.cashierDiscountLimitBps });
    res.status(201).json({ sale });
  };
  invoice = async (req: Request, res: Response) => res.json({ sale: await this.service.getInvoice(saleIdSchema.parse(req.params.id)) });
  updateMetadata = async (req: Request, res: Response) => res.json({ sale: await this.service.updateMetadata(saleIdSchema.parse(req.params.id), updateSaleMetadataInputSchema.parse(req.body), req.auth!.id) });
  fbrStatus = async (_req: Request, res: Response) => res.json(await this.service.fbrStatus());
  submitFbr = async (req: Request, res: Response) => res.json({ sale: await this.service.submitFbr(saleIdSchema.parse(req.params.id), req.auth!.id) });
  validateFbr = async (req: Request, res: Response) => res.json({ sale: await this.service.validateFbr(saleIdSchema.parse(req.params.id), req.auth!.id) });
  hold = async (req: Request, res: Response) => res.status(201).json({ hold: await this.service.hold(holdSaleInputSchema.parse(req.body), req.auth!.id) });
  holds = async (req: Request, res: Response) => res.json({ holds: await this.service.holds(req.auth!.id) });
  removeHold = async (req: Request, res: Response) => { await this.service.removeHold(saleIdSchema.parse(req.params.id), req.auth!.id); res.status(204).send(); };
  void = async (req: Request, res: Response) => { const input = reversalInputSchema.parse(req.body); res.json(await this.service.void(saleIdSchema.parse(req.params.id), input.reason, req.auth!.id)); };
}
