import type { Request, Response } from "express";
import { createExpenseCategoryInputSchema, createExpenseInputSchema, expenseListQuerySchema, updateExpenseCategoryInputSchema, voidExpenseInputSchema } from "@oil-agency/shared";
import type { ExpenseService } from "./expense.service.js";

export class ExpenseController {
  constructor(private readonly service: ExpenseService) {}
  categories = async (req: Request, res: Response) => res.json({ categories: await this.service.categories(req.query.includeInactive === "true") });
  createCategory = async (req: Request, res: Response) => res.status(201).json({ category: await this.service.createCategory(createExpenseCategoryInputSchema.parse(req.body), req.auth!.id) });
  updateCategory = async (req: Request, res: Response) => res.json({ category: await this.service.updateCategory(String(req.params.id), updateExpenseCategoryInputSchema.parse(req.body), req.auth!.id) });
  list = async (req: Request, res: Response) => res.json(await this.service.list(expenseListQuerySchema.parse(req.query)));
  create = async (req: Request, res: Response) => res.status(201).json({ expense: await this.service.create(createExpenseInputSchema.parse(req.body), req.auth!.id) });
  void = async (req: Request, res: Response) => res.json({ expense: await this.service.void(String(req.params.id), voidExpenseInputSchema.parse(req.body), req.auth!.id) });
}
