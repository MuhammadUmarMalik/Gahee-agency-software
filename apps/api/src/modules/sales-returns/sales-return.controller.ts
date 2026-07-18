import type { Request, Response } from "express";
import { createSalesReturnInputSchema, reversalInputSchema, salesReturnIdSchema, salesReturnSearchSchema } from "@oil-agency/shared";
import type { SalesReturnService } from "./sales-return.service.js";

export class SalesReturnController {
  constructor(private readonly service: SalesReturnService) {}
  search = async (req: Request, res: Response) => { const query = salesReturnSearchSchema.parse(req.query); res.json({ sales: await this.service.search(query.invoice) }); };
  sale = async (req: Request, res: Response) => res.json({ sale: await this.service.originalSale(salesReturnIdSchema.parse(req.params.saleId)) });
  replacements = async (req: Request, res: Response) => res.json({ products: await this.service.replacementOptions(typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "") });
  create = async (req: Request, res: Response) => res.status(201).json({ salesReturn: await this.service.create(createSalesReturnInputSchema.parse(req.body), req.auth!.id) });
  get = async (req: Request, res: Response) => res.json({ salesReturn: await this.service.get(salesReturnIdSchema.parse(req.params.id)) });
  reverse = async (req: Request, res: Response) => { const input = reversalInputSchema.parse(req.body); res.json(await this.service.reverse(salesReturnIdSchema.parse(req.params.id), input.reason, req.auth!.id)); };
}
