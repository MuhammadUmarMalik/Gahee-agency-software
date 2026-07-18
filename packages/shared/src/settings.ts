import { z } from "zod";

const plainText = (max: number) => z.string().trim().max(max);
export const businessSettingSchema = z.object({
  name: plainText(120).min(2),
  nameUrdu: plainText(120),
  address: plainText(300),
  addressUrdu: plainText(300),
  phone: plainText(40),
  currency: z.literal("PKR"),
  timezone: z.literal("Asia/Karachi"),
  logoDataUrl: z.string().max(1_500_000, "Encoded logo is too large.").nullable().refine((value) => value === null || /^data:image\/(png|jpeg|webp);base64,/i.test(value), "Logo must be a PNG, JPEG, or WebP image."),
  thankYou: plainText(160),
  thankYouUrdu: plainText(160),
});

export const SHORTCUT_KEYS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"] as const;
export const shortcutSettingSchema = z.object({
  focusSearch: z.enum(SHORTCUT_KEYS),
  checkout: z.enum(SHORTCUT_KEYS),
  holdSale: z.enum(SHORTCUT_KEYS),
  resumeSale: z.enum(SHORTCUT_KEYS),
}).refine((value) => new Set(Object.values(value)).size === 4, "Each action must use a different shortcut key.");

export const printingSettingSchema = z.object({
  defaultPaper: z.enum(["A4", "THERMAL_80MM"]),
  autoPrint: z.boolean(),
});

export const backupSettingSchema = z.object({
  reminderDays: z.number().int().min(1).max(30),
});

export type BusinessSetting = z.infer<typeof businessSettingSchema>;
export type ShortcutSetting = z.infer<typeof shortcutSettingSchema>;
export type PrintingSetting = z.infer<typeof printingSettingSchema>;
export type BackupSetting = z.infer<typeof backupSettingSchema>;

export const DEFAULT_BUSINESS_SETTING: BusinessSetting = { name: "Oil & Ghee Agency", nameUrdu: "آئل اینڈ گھی ایجنسی", address: "Main Market, Pakistan", addressUrdu: "مین مارکیٹ، پاکستان", phone: "", currency: "PKR", timezone: "Asia/Karachi", logoDataUrl: null, thankYou: "Thank you for your business", thankYouUrdu: "آپ کی خریداری کا شکریہ" };
export const DEFAULT_SHORTCUT_SETTING: ShortcutSetting = { focusSearch: "F2", checkout: "F4", holdSale: "F6", resumeSale: "F8" };
export const DEFAULT_PRINTING_SETTING: PrintingSetting = { defaultPaper: "A4", autoPrint: true };
export const DEFAULT_BACKUP_SETTING: BackupSetting = { reminderDays: 1 };
