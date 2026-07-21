import { randomBytes } from "node:crypto";
import type { AppDbClient, TransactionClient } from "../../lib/db.js";
import { ROLE_PERMISSIONS, type AuthUser, type LoginInput, type LoginResponse, type PermissionCode, type RoleCode, type SetupOwnerInput } from "@oil-agency/shared";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { hashSecret, verifySecret } from "../../lib/password.js";
import { createSessionToken } from "../../lib/security.js";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type UserWithRole = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  cashierDiscountLimitBps: number;
  failedLoginAttempts: number;
  lockedUntil: Date | string | null;
  lastLoginAt: Date | null;
  isActive: boolean;
  deletedAt: Date | null;
  role: {
    code: string;
    permissions: Array<{ permission: { code: string } }>;
  };
};

export class AuthService {
  private readonly dummyPasswordHash = hashSecret(randomBytes(32).toString("base64url"));

  constructor(private readonly db: AppDbClient) {}

  async setupStatus(): Promise<{ needsSetup: boolean }> {
    return { needsSetup: (await this.db.user.count()) === 0 };
  }

  async setupOwner(input: SetupOwnerInput): Promise<{ username: string }> {
    if (!(await this.setupStatus()).needsSetup)
      throw new HttpError(409, "SETUP_ALREADY_COMPLETED", "The owner account has already been configured.");

    const [passwordHash, ownerPinHash] = await Promise.all([
      hashSecret(input.password),
      hashSecret(input.ownerPin),
    ]);
    return this.db.$transaction(async (tx: TransactionClient) => {
      if (await tx.user.count())
        throw new HttpError(409, "SETUP_ALREADY_COMPLETED", "The owner account has already been configured.");
      const role = await tx.role.findUnique({ where: { code: "OWNER" } });
      if (!role) throw new HttpError(503, "SETUP_DATA_MISSING", "The installation data is incomplete. Reinstall the application.");
      const owner = await tx.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          ownerPinHash,
          roleId: role.id,
          isActive: true,
        },
        select: { id: true, username: true, displayName: true, roleId: true, isActive: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          userId: owner.id,
          action: "INITIAL_SETUP",
          entityType: "User",
          entityId: owner.id,
          afterJson: JSON.stringify(owner),
        },
      });
      return { username: owner.username };
    });
  }

  async findUserForAuth(username: string): Promise<UserWithRole | null> {
    return this.db.user.findUnique({
      where: { username },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
  }

  private toAuthUser(user: UserWithRole): AuthUser {
    const role = user.role.code as RoleCode;
    const permissions = [...new Set<PermissionCode>([...ROLE_PERMISSIONS[role], ...user.role.permissions.map(({ permission }) => permission.code as PermissionCode)])];
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role,
      permissions,
      cashierDiscountLimitBps: user.cashierDiscountLimitBps,
    };
  }

  async login(input: LoginInput, ipAddress?: string): Promise<LoginResponse> {
    const user = await this.findUserForAuth(input.username);
    const now = new Date();

    const passwordValid = await verifySecret(user?.passwordHash ?? await this.dummyPasswordHash, input.password);
    const lockedUntil = user ? coerceDate(user.lockedUntil) : null;
    if (user?.isActive && !user.deletedAt && lockedUntil && lockedUntil > now) {
      await this.recordLogin(user.id, input.username, false, "ACCOUNT_LOCKED", ipAddress);
      throw new HttpError(423, "ACCOUNT_LOCKED", "Account is temporarily locked. Try again later.");
    }
    const lockExpired = Boolean(lockedUntil && lockedUntil <= now);
    if (user?.isActive && !user.deletedAt && user.lockedUntil && (!lockedUntil || lockExpired))
      await this.db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    if (!user || !user.isActive || user.deletedAt || !passwordValid) {
      if (user?.isActive && !user.deletedAt) {
        const attempts = (lockExpired ? 0 : user.failedLoginAttempts) + 1;
        await this.db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts >= MAX_ATTEMPTS ? MAX_ATTEMPTS : attempts,
            lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
          },
        });
      }
      await this.recordLogin(user?.id, input.username, false, "INVALID_CREDENTIALS", ipAddress);
      throw new HttpError(401, "INVALID_CREDENTIALS", "Username or password is incorrect.");
    }

    const expiresAt = new Date(now.getTime() + env.SESSION_TTL_HOURS * 3_600_000);
    const { token, tokenHash } = createSessionToken();
    await this.db.$transaction(async (tx: TransactionClient) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now } });
      await tx.session.create({ data: { tokenHash, userId: user.id, expiresAt } });
      await tx.loginHistory.create({ data: { userId: user.id, username: user.username, success: true, ...(ipAddress ? { ipAddress } : {}) } });
    });

    return { token, expiresAt: expiresAt.toISOString(), user: this.toAuthUser(user) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async recordLogin(userId: string | undefined, username: string, success: boolean, reason: string, ipAddress?: string) {
    await this.db.loginHistory.create({
      data: { username, success, reason, ...(userId ? { userId } : {}), ...(ipAddress ? { ipAddress } : {}) },
    });
  }
}

function coerceDate(value: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}.000Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
