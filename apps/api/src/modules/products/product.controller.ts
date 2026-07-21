import type { Request, Response } from "express";
import {
  createProductInputSchema,
  generateSkuQuerySchema,
  productIdSchema,
  productListQuerySchema,
  updateProductInputSchema,
} from "@oil-agency/shared";
import type { ProductService } from "./product.service.js";

export class ProductController {
  constructor(private readonly service: ProductService) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(productListQuerySchema.parse(req.query)));
  };
  options = async (_req: Request, res: Response) => {
    res.json(await this.service.options());
  };
  get = async (req: Request, res: Response) => {
    res.json({
      product: await this.service.get(productIdSchema.parse(req.params.id)),
    });
  };
  barcode = async (_req: Request, res: Response) => {
    res.json({ barcode: await this.service.generateBarcode() });
  };
  sku = async (req: Request, res: Response) => {
    res.json({
      sku: await this.service.generateSku(
        generateSkuQuerySchema.parse(req.query),
      ),
    });
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json({
      product: await this.service.create(
        createProductInputSchema.parse(req.body),
        req.auth!.id,
      ),
    });
  };
  update = async (req: Request, res: Response) => {
    res.json({
      product: await this.service.update(
        productIdSchema.parse(req.params.id),
        updateProductInputSchema.parse(req.body),
        req.auth!.id,
      ),
    });
  };
  restore = async (req: Request, res: Response) => {
    res.json({
      product: await this.service.restore(
        productIdSchema.parse(req.params.id),
        req.auth!.id,
      ),
    });
  };
  remove = async (req: Request, res: Response) => {
    await this.service.remove(
      productIdSchema.parse(req.params.id),
      req.auth!.id,
    );
    res.status(204).send();
  };
}
