import { describe, expect, it, vi } from "vitest";
import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import { setupOwnerInputSchema } from "@oil-agency/shared";
import { AuthService } from "./auth.service.js";

const setupInput = setupOwnerInputSchema.parse({
  username: "  Agency.Owner  ",
  displayName: "Agency Owner",
  password: "StrongOwner123",
  confirmPassword: "StrongOwner123",
  ownerPin: "4827",
  confirmOwnerPin: "4827",
});

describe("first-run owner setup", () => {
  it("creates exactly one active owner with hashed credentials and an audit record", async () => {
    const create = vi.fn().mockResolvedValue({ id: "owner-1", username: "agency.owner", displayName: "Agency Owner", roleId: "role-owner", isActive: true, createdAt: new Date("2026-07-20") });
    const audit = vi.fn().mockResolvedValue({ id: "audit-1" });
    const tx = {
      user: { count: vi.fn().mockResolvedValue(0), create },
      role: { findUnique: vi.fn().mockResolvedValue({ id: "role-owner", code: "OWNER" }) },
      auditLog: { create: audit },
    };
    const db = {
      user: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    } as unknown as AppDbClient;

    await expect(new AuthService(db).setupOwner(setupInput)).resolves.toEqual({ username: "agency.owner" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ username: "agency.owner", roleId: "role-owner", isActive: true }) }));
    const stored = create.mock.calls.at(0)?.[0]?.data;
    expect(stored).toBeDefined();
    expect(stored?.passwordHash).not.toBe(setupInput.password);
    expect(stored?.ownerPinHash).not.toBe(setupInput.ownerPin);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "INITIAL_SETUP", userId: "owner-1" }) }));
  });

  it("refuses setup after any active installation user exists", async () => {
    const db = { user: { count: vi.fn().mockResolvedValue(1) } } as unknown as AppDbClient;
    await expect(new AuthService(db).setupOwner(setupInput)).rejects.toMatchObject({ code: "SETUP_ALREADY_COMPLETED", status: 409 });
  });
});
