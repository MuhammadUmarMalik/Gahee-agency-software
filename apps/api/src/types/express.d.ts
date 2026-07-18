import type { AuthUser } from "@oil-agency/shared";

declare global {
  namespace Express {
    interface Request { auth?: AuthUser & { sessionId: string } }
  }
}

export {};
