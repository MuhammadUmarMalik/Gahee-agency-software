import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile, stat, writeFile } from "node:fs/promises";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import "dotenv/config";

const API_PORT = 4317;
const EXTERNAL_LINK_HOSTS = new Set(["www.umarmalikd-dev.com", "umarmalikd-dev.com", "wa.me"]);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let apiServer: import("node:http").Server | null = null;
let activeDatabasePath = "";
let stopDailyClosingScheduler: (() => void) | null = null;

async function startApi() {
  const databasePath = app.isPackaged
    ? path.join(app.getPath("userData"), "agency.db")
    : path.resolve(app.getAppPath(), "../../prisma/data/agency.db");
  activeDatabasePath = databasePath;
  process.env.DATABASE_URL ??= `file:${databasePath.replaceAll("\\", "/")}`;
  process.env.API_PORT = String(API_PORT);
  const { createApp } = await import("../../api/src/app.js");
  const { prisma } = await import("../../api/src/lib/prisma.js");
  const { startDailyClosingScheduler } = await import("../../api/src/modules/cashbook/daily-closing.scheduler.js");
  await new Promise<void>((resolve, reject) => {
    apiServer = createApp().listen(API_PORT, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
    apiServer.once("error", reject);
  });
  stopDailyClosingScheduler = startDailyClosingScheduler(prisma);
}

function createWindow() {
  const iconFileName = process.platform === "win32" ? "app-icon.ico" : "app-icon.png";
  const iconPath = app.isPackaged
    ? path.join(currentDirectory, "../dist", iconFileName)
    : path.resolve(app.getAppPath(), "public", iconFileName);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: "#f7f8f3",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === "https:" && EXTERNAL_LINK_HOSTS.has(target.hostname)) void shell.openExternal(target.toString());
    } catch { /* Ignore invalid external URLs. */ }
    return { action: "deny" };
  });
  if (process.env.VITE_DEV_SERVER_URL) void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void mainWindow.loadFile(path.join(currentDirectory, "../dist/index.html"));
}

async function invoiceWindow(html: string) {
  if (typeof html !== "string" || html.length < 20 || html.length > 4_000_000) throw new Error("Invalid invoice document.");
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return window;
}

function registerPrintHandlers() {
  ipcMain.handle("invoice:thermal", async (_event, html: string) => { const window = await invoiceWindow(html); try { await new Promise<void>((resolve, reject) => window.webContents.print({ silent: false, printBackground: true, pageSize: { width: 80000, height: 297000 }, margins: { marginType: "none" } }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason || "Printing was cancelled.")))); return { success: true }; } finally { window.destroy(); } });
  ipcMain.handle("invoice:a4", async (_event, html: string) => { const window = await invoiceWindow(html); try { await new Promise<void>((resolve, reject) => window.webContents.print({ silent: false, printBackground: true, pageSize: "A4", margins: { marginType: "default" } }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason || "Printing was cancelled.")))); return { success: true }; } finally { window.destroy(); } });
  ipcMain.handle("report:print", async (_event, html: string) => { const window = await invoiceWindow(html); try { const result = await new Promise<{ success: boolean; canceled: boolean }>((resolve, reject) => window.webContents.print({ silent: false, printBackground: true, landscape: true, pageSize: "A4", margins: { marginType: "default" } }, (success, failureReason) => { if (success) resolve({ success: true, canceled: false }); else if (/cancel(?:ed|led)/i.test(failureReason ?? "")) resolve({ success: false, canceled: true }); else reject(new Error(failureReason || "Printing failed.")); })); return result; } finally { window.destroy(); } });
  ipcMain.handle("invoice:pdf", async (_event, html: string, suggestedName: string) => { const window = await invoiceWindow(html); try { const result = await dialog.showSaveDialog(mainWindow ?? window, { title: "Save invoice as PDF", defaultPath: `${suggestedName.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`, filters: [{ name: "PDF document", extensions: ["pdf"] }] }); if (result.canceled || !result.filePath) return { canceled: true }; const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: "A4" }); await writeFile(result.filePath, pdf); return { canceled: false, filePath: result.filePath }; } finally { window.destroy(); } });
  ipcMain.handle("backup:create", async () => {
    if (!activeDatabasePath) throw new Error("The local database is not ready.");
    const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "");
    const options = { title: "Save local database backup", defaultPath: `oil-agency-backup-${stamp}.db`, filters: [{ name: "Oil Agency database backup", extensions: ["db"] }] };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };
    const { prisma } = await import("../../api/src/lib/prisma.js");
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(FULL)").catch(() => undefined);
    await copyFile(activeDatabasePath, result.filePath);
    const details = await stat(result.filePath);
    return { canceled: false, filePath: result.filePath, fileName: path.basename(result.filePath), sizeBytes: details.size, createdAt: new Date().toISOString() };
  });
}

app.setName("Oil Agency POS");
if (process.platform === "win32") app.setAppUserModelId("com.umarmalik.oil-agency-pos");

app.whenReady().then(async () => {
  await startApi();
  registerPrintHandlers();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => { console.error(error); app.quit(); });

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { stopDailyClosingScheduler?.(); apiServer?.close(); });
