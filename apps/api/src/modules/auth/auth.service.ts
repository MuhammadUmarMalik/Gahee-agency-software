import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthUser, LoginInput, LoginResponse, PermissionCode, RoleCode } from "@oil-agency/shared";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { createSessionToken } from "../../lib/security.js";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type UserWithRole = Prisma.UserGetPayload<{
  include: { role: { include: { permissions: { include: { permission: true } } } } };
}>;

export class AuthService {
  private readonly dummyPasswordHash = argon2.hash(randomBytes(32).toString("base64url"));

  constructor(private readonly db: PrismaClient) {}

  async findUserForAuth(username: string): Promise<UserWithRole | null> {
    return this.db.user.findUnique({
      where: { username },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
  }

  private toAuthUser(user: UserWithRole): AuthUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role.code as RoleCode,
      permissions: user.role.permissions.map(({ permission }) => permission.code as PermissionCode),
      cashierDiscountLimitBps: user.cashierDiscountLimitBps,
    };
  }

  async login(input: LoginInput, ipAddress?: string): Promise<LoginResponse> {
    const user = await this.findUserForAuth(input.username);
    const now = new Date();

    const passwordValid = await argon2.verify(user?.passwordHash ?? await this.dummyPasswordHash, input.password);
    if (user?.isActive && !user.deletedAt && user.lockedUntil && user.lockedUntil > now) {
      await this.recordLogin(user.id, input.username, false, "ACCOUNT_LOCKED", ipAddress);
      throw new HttpError(423, "ACCOUNT_LOCKED", "Account is temporarily locked. Try again later.");
    }
    if (!user || !user.isActive || user.deletedAt || !passwordValid) {
      if (user?.isActive && !user.deletedAt) {
        const attempts = user.failedLoginAttempts + 1;
        await this.db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
            lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
          },
        });
      }
      await this.recordLogin(user?.id, input.username, false, "INVALID_CREDENTIALS", ipAddress);
      throw new HttpError(401, "INVALID_CREDENTIALS", "Username or password is incorrect.");
    }

    const expiresAt = new Date(now.getTime() + env.SESSION_TTL_HOURS * 3_600_000);
    const { token, tokenHash } = createSessionToken();
    await this.db.$transaction([
      this.db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now } }),
      this.db.session.create({ data: { tokenHash, userId: user.id, expiresAt } }),
      this.db.loginHistory.create({ data: { userId: user.id, username: user.username, success: true, ...(ipAddress ? { ipAddress } : {}) } }),
    ]);

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
