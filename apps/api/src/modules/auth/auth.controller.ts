import type { Request, Response } from "express";
import type { LoginInput, SetupOwnerInput } from "@oil-agency/shared";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  setupStatus = async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await this.service.setupStatus());
  };

  setupOwner = async (req: Request, res: Response) => {
    const result = await this.service.setupOwner(req.body as SetupOwnerInput);
    res.status(201).json(result);
  };

  login = async (req: Request, res: Response) => {
    const result = await this.service.login(req.body as LoginInput, req.ip);
    res.json(result);
  };

  me = (req: Request, res: Response) => {
    const { sessionId: _sessionId, ...user } = req.auth!;
    res.json({ user });
  };

  logout = async (req: Request, res: Response) => {
    await this.service.logout(req.auth!.sessionId);
    res.status(204).send();
  };
}
