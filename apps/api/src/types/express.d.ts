import type { AuthUser } from "@oil-agency/shared";

declare global {
  type Account = Record<string, any>;
  type Customer = Record<string, any>;
  type CustomerLedger = Record<string, any>;
  type Product = Record<string, any>;
  type ProductBatch = Record<string, any>;
  type ProductPacking = Record<string, any>;
  type Supplier = Record<string, any>;
  type SupplierLedger = Record<string, any>;

  namespace Express {
    interface Request { auth?: AuthUser & { sessionId: string } }
  }
}

export {};
