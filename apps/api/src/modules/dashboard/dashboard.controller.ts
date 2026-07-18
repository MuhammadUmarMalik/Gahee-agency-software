import type { Request, Response } from "express";
import type { DashboardService } from "./dashboard.service.js";
export class DashboardController { constructor(private readonly service: DashboardService) {} get = async (_req: Request, res: Response) => res.json(await this.service.get()); }
