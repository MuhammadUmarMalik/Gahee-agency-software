import { z } from "zod";

export const ROLE_CODES = ["OWNER", "ADMIN", "CASHIER"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard:view",
  POS_USE: "pos:use",
  SALES_VIEW: "sales:view",
  SALES_RETURN: "sales:return",
  PRODUCTS_MANAGE: "products:manage",
  INVENTORY_VIEW: "inventory:view",
  INVENTORY_ADJUST: "inventory:adjust",
  PURCHASES_MANAGE: "purchases:manage",
  PARTIES_MANAGE: "parties:manage",
  PAYMENTS_MANAGE: "payments:manage",
  CASHBOOK_VIEW: "cashbook:view",
  CASHBOOK_MANAGE: "cashbook:manage",
  CASHBOOK_CLOSE: "cashbook:close",
  EXPENSES_MANAGE: "expenses:manage",
  REPORTS_BASIC: "reports:basic",
  REPORTS_SENSITIVE: "reports:sensitive",
  ACCOUNTING_VIEW: "accounting:view",
  ACCOUNTING_MANAGE: "accounting:manage",
  ACCOUNTING_PERIODS: "accounting:periods",
  FINANCIAL_REPORTS: "accounting:reports",
  BANK_ACCOUNTS_MANAGE: "accounting:banks",
  USERS_MANAGE: "users:manage",
  SETTINGS_MANAGE: "settings:manage",
  BACKUP_MANAGE: "backup:manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  OWNER: Object.values(PERMISSIONS),
  ADMIN: Object.values(PERMISSIONS).filter((code) => code !== PERMISSIONS.USERS_MANAGE && code !== PERMISSIONS.SETTINGS_MANAGE),
  CASHIER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.POS_USE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_RETURN,
    PERMISSIONS.PARTIES_MANAGE,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.REPORTS_BASIC,
  ],
};

export const loginInputSchema = z.object({
  username: z.string().trim().min(3).max(50).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const passwordSchema = z.string()
  .min(10, "Password must contain at least 10 characters.")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const ownerPinSchema = z.string().regex(/^\d{4,12}$/, "Owner PIN must contain 4 to 12 digits.");

export const setupOwnerInputSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "Use only letters, numbers, dots, underscores, or hyphens.").transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(80),
  password: passwordSchema,
  confirmPassword: z.string(),
  ownerPin: ownerPinSchema,
  confirmOwnerPin: z.string(),
}).superRefine((input, context) => {
  if (input.password !== input.confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
  if (input.ownerPin !== input.confirmOwnerPin) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmOwnerPin"], message: "Owner PINs do not match." });
});

export type SetupOwnerInput = z.infer<typeof setupOwnerInputSchema>;

export const createUserInputSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(80),
  password: passwordSchema,
  roleCode: z.enum(ROLE_CODES),
  cashierDiscountLimitBps: z.number().int().min(0).max(10_000),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  roleCode: z.enum(ROLE_CODES).optional(),
  cashierDiscountLimitBps: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const resetPasswordInputSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: RoleCode;
  permissions: PermissionCode[];
  cashierDiscountLimitBps: number;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}
