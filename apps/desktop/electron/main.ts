import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  access,
  appendFile,
  mkdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import Database from "better-sqlite3";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { FBR_INTEGRATION_ENABLED } from "@oil-agency/shared";
import "dotenv/config";
import { SecureStorageService } from "./services/secure-storage.service.js";
import { NetworkService } from "./services/network.service.js";
import { JobQueueService } from "./services/job-queue.service.js";
import { BackupService } from "./services/backup.service.js";
import { RestoreService } from "./services/restore.service.js";
import { GoogleDriveService } from "./services/google-drive.service.js";
import { FbrSyncService } from "./services/fbr-sync.service.js";
import { assertOfflineSyncSchema } from "./services/offline-sync-schema.service.js";
import { databasePathsEqual, migrateDatabase } from "../../api/src/lib/database-startup.js";

const API_PORT = 4317;
const EXTERNAL_LINK_HOSTS = new Set([
  "www.umarmalikd-dev.com",
  "umarmalikd-dev.com",
  "wa.me",
]);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let apiServer: import("node:http").Server | null = null;
let stopDailyClosingScheduler: (() => void) | null = null;
let jobTimer: NodeJS.Timeout | null = null;
let backups: BackupService | null = null;
let restoreService: RestoreService | null = null;
let drive: GoogleDriveService | null = null;
let fbrSync: FbrSyncService | null = null;
let jobs: JobQueueService | null = null;
let databaseClient: import("../../api/src/lib/db.js").AppDbClient | null = null;
let startupDatabasePath: string | null = null;

function formatError(error: unknown) {
  if (error instanceof Error) return error.stack ?? error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}

async function reportStartupError(error: unknown) {
  const message = `${startupDatabasePath ? `Database: ${startupDatabasePath}\n` : ""}${formatError(error)}`;
  console.error(message);
  let logPath: string | null = null;
  try {
    const logDirectory = app.getPath("userData");
    await mkdir(logDirectory, { recursive: true });
    logPath = path.join(logDirectory, "startup-error.log");
    await appendFile(
      logPath,
      `[${new Date().toISOString()}]\n${message}\n\n`,
      "utf8",
    );
  } catch (logError) {
    console.error("Failed to write startup error log:", logError);
  }
  dialog.showErrorBox(
    "Oil Agency POS could not start",
    `${message}\n\n${logPath ? `Error log: ${logPath}` : "The error log could not be written."}`,
  );
}

async function startApi() {
  const databasePath = app.isPackaged
    ? path.join(app.getPath("userData"), "oil-agency-pos", "app.db")
    : path.resolve(app.getAppPath(), "../../data/agency.db");
  startupDatabasePath = databasePath;
  await mkdir(path.dirname(databasePath), { recursive: true });
  if (app.isPackaged)
    await preserveLegacyDatabase(path.join(app.getPath("userData"), "agency.db"), databasePath);
  process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
  process.env.API_PORT = String(API_PORT);
  const migrationsPath = app.isPackaged
    ? path.join(process.resourcesPath, "drizzle")
    : path.resolve(app.getAppPath(), "../../drizzle");
  console.info(`[startup] ${app.isPackaged ? "packaged" : "development"} database: ${databasePath}`);
  console.info(`[startup] migrations: ${migrationsPath}`);
  migrateDatabase(databasePath, migrationsPath);
  const { createApp } = await import("../../api/src/app.js");
  const { db, resolveDatabasePath } = await import("../../api/src/lib/db.js");
  const serviceDatabasePath = resolveDatabasePath();
  if (!databasePathsEqual(serviceDatabasePath, databasePath))
    throw new Error(`Database path mismatch: startup=${databasePath}; services=${serviceDatabasePath}`);
  console.info(`[database] API and Electron services share: ${serviceDatabasePath}`);
  databaseClient = db;
  const { seedDatabase } = await import("../../../scripts/seed.js");
  await seedDatabase({ createOwner: false });
  await assertOfflineSyncSchema(db);
  const { startDailyClosingScheduler } =
    await import("../../api/src/modules/cashbook/daily-closing.scheduler.js");
  await new Promise<void>((resolve, reject) => {
    apiServer = createApp(db).listen(API_PORT, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
    apiServer.once("error", reject);
  });
  stopDailyClosingScheduler = startDailyClosingScheduler(databasePath);
  const secureStorage = new SecureStorageService(app.getPath("userData"));
  jobs = new JobQueueService(db);
  backups = new BackupService(
    db,
    app.getPath("userData"),
    secureStorage,
    jobs,
  );
  drive = new GoogleDriveService(db, secureStorage);
  if (FBR_INTEGRATION_ENABLED) {
    fbrSync = new FbrSyncService(
      db,
      jobs,
      new NetworkService(),
      secureStorage,
    );
    const configuredToken = process.env.FBR_SANDBOX_TOKEN?.trim();
    if (
      configuredToken &&
      !/^(?:n\/?a|undefined|null)$/i.test(configuredToken) &&
      !(await fbrSync.tokenStatus()).sandboxConfigured
    )
      await fbrSync.setToken(configuredToken, "SANDBOX");
  }
  restoreService = new RestoreService(databasePath, backups, async () => {
    stopDailyClosingScheduler?.();
    stopDailyClosingScheduler = null;
    await new Promise<void>(
      (resolve) => apiServer?.close(() => resolve()) ?? resolve(),
    );
    apiServer = null;
    await db.$disconnect();
  });
  await fbrSync?.seedPending();
  jobTimer = setInterval(() => void runBackgroundJobs(), 30_000);
  setTimeout(() => void ensureDailyBackup(), 10_000);
  setTimeout(() => void runBackgroundJobs(), 3_000);
}

async function preserveLegacyDatabase(legacyPath: string, databasePath: string) {
  if ((await fileExists(databasePath)) || !(await fileExists(legacyPath))) return;
  const temporaryPath = `${databasePath}.migrating`;
  await unlink(temporaryPath).catch(() => undefined);
  const legacy = new Database(legacyPath, { readonly: true, fileMustExist: true });
  try {
    await legacy.backup(temporaryPath);
  } finally {
    legacy.close();
  }
  const copied = new Database(temporaryPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = copied.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Legacy database copy failed integrity check: ${String(integrity)}`);
  } finally {
    copied.close();
  }
  await rename(temporaryPath, databasePath);
  console.info(`[database] preserved legacy database ${legacyPath} at ${databasePath}`);
}

async function ensureDailyBackup() {
  if (!backups) return;
  const latest = (await backups.list())[0];
  const latestCreatedAt =
    latest && latest.createdAt instanceof Date
      ? latest.createdAt
      : latest
        ? new Date(latest.createdAt)
        : null;
  if (
    !latestCreatedAt ||
    Number.isNaN(latestCreatedAt.getTime()) ||
    Date.now() - latestCreatedAt.getTime() >= 86_400_000
  )
    await backups
      .create("AUTOMATIC")
      .catch((error) =>
        console.error(
          "Automatic backup failed:",
          error instanceof Error ? error.message : error,
        ),
      );
}

async function runBackgroundJobs() {
  if (FBR_INTEGRATION_ENABLED) void fbrSync?.processPending();
  if (!drive || !jobs || !(await drive.status()).connected) return;
  while (true) {
    const job = await jobs.claim("GOOGLE_DRIVE_UPLOAD");
    if (!job) break;
    try {
      const payload = JSON.parse(job.payloadJson) as { backupId?: unknown };
      if (typeof payload.backupId !== "string")
        throw new Error("Backup upload job is invalid.");
      await drive.uploadBackup(payload.backupId);
      await jobs.complete(job.id);
    } catch (error) {
      await jobs.retry(job.id, error);
    }
  }
}

function createWindow() {
  const iconFileName =
    process.platform === "win32" ? "app-icon.ico" : "app-icon.png";
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
      if (
        target.protocol === "https:" &&
        EXTERNAL_LINK_HOSTS.has(target.hostname)
      )
        void shell.openExternal(target.toString());
    } catch {
      /* Ignore invalid external URLs. */
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppNavigation(url)) event.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL)
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else
    void mainWindow.loadFile(path.join(currentDirectory, "../dist/index.html"));
}

function isAllowedAppNavigation(url: string) {
  try {
    const target = new URL(url);
    if (target.protocol === "file:") return app.isPackaged;
    if (!process.env.VITE_DEV_SERVER_URL) return false;
    const devServer = new URL(process.env.VITE_DEV_SERVER_URL);
    return target.origin === devServer.origin;
  } catch {
    return false;
  }
}

async function invoiceWindow(html: string) {
  if (typeof html !== "string" || html.length < 20 || html.length > 4_000_000)
    throw new Error("Invalid invoice document.");
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  );
  return window;
}

function registerPrintHandlers() {
  ipcMain.handle("invoice:thermal", async (_event, html: string) => {
    const window = await invoiceWindow(html);
    try {
      await new Promise<void>((resolve, reject) =>
        window.webContents.print(
          {
            silent: false,
            printBackground: true,
            pageSize: { width: 80000, height: 297000 },
            margins: { marginType: "none" },
          },
          (success, failureReason) =>
            success
              ? resolve()
              : reject(new Error(failureReason || "Printing was cancelled.")),
        ),
      );
      return { success: true };
    } finally {
      window.destroy();
    }
  });
  ipcMain.handle("invoice:a4", async (_event, html: string) => {
    const window = await invoiceWindow(html);
    try {
      await new Promise<void>((resolve, reject) =>
        window.webContents.print(
          {
            silent: false,
            printBackground: true,
            pageSize: "A4",
            margins: { marginType: "default" },
          },
          (success, failureReason) =>
            success
              ? resolve()
              : reject(new Error(failureReason || "Printing was cancelled.")),
        ),
      );
      return { success: true };
    } finally {
      window.destroy();
    }
  });
  ipcMain.handle("report:print", async (_event, html: string) => {
    const window = await invoiceWindow(html);
    try {
      const result = await new Promise<{ success: boolean; canceled: boolean }>(
        (resolve, reject) =>
          window.webContents.print(
            {
              silent: false,
              printBackground: true,
              landscape: true,
              pageSize: "A4",
              margins: { marginType: "default" },
            },
            (success, failureReason) => {
              if (success) resolve({ success: true, canceled: false });
              else if (/cancel(?:ed|led)/i.test(failureReason ?? ""))
                resolve({ success: false, canceled: true });
              else reject(new Error(failureReason || "Printing failed."));
            },
          ),
      );
      return result;
    } finally {
      window.destroy();
    }
  });
  ipcMain.handle(
    "invoice:pdf",
    async (_event, html: string, suggestedName: string) => {
      const window = await invoiceWindow(html);
      try {
        const result = await dialog.showSaveDialog(mainWindow ?? window, {
          title: "Save invoice as PDF",
          defaultPath: `${suggestedName.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`,
          filters: [{ name: "PDF document", extensions: ["pdf"] }],
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        const pdf = await window.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
        });
        await writeFile(result.filePath, pdf);
        return { canceled: false, filePath: result.filePath };
      } finally {
        window.destroy();
      }
    },
  );
  ipcMain.handle("backup:create", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return serializeBackup(
      await required(backups, "Backup service").create("MANUAL"),
    );
  });
  ipcMain.handle("backup:list", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return (await required(backups, "Backup service").list()).map(
      serializeBackup,
    );
  });
  ipcMain.handle("backup:import", async (_event, authToken: string) => {
    await requireOwner(authToken);
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Import encrypted Oil POS backup",
      properties: ["openFile"],
      filters: [
        { name: "Oil POS encrypted backup", extensions: ["oilbackup"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return {
      canceled: false,
      backup: serializeBackup(
        await required(backups, "Backup service").import(result.filePaths[0]),
      ),
    };
  });
  ipcMain.handle(
    "backup:restore",
    async (_event, authToken: string, filePath: string) => {
      await requireOwner(authToken);
      return restoreBackup(filePath);
    },
  );
  ipcMain.handle("google:status", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return required(drive, "Google Drive service").status();
  });
  ipcMain.handle(
    "google:connect",
    async (_event, authToken: string, clientId: string) => {
      await requireOwner(authToken);
      return required(drive, "Google Drive service").connect(clientId);
    },
  );
  ipcMain.handle("google:disconnect", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return required(drive, "Google Drive service").disconnect();
  });
  ipcMain.handle("google:upload-pending", async (_event, authToken: string) => {
    await requireOwner(authToken);
    const queue = required(jobs, "Job queue");
    for (const job of await queue.list("GOOGLE_DRIVE_UPLOAD", "FAILED"))
      await queue.retryNow(job.id);
    await runBackgroundJobs();
    return { queued: true };
  });
  ipcMain.handle("google:list-backups", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return required(drive, "Google Drive service").listBackups();
  });
  ipcMain.handle(
    "google:restore",
    async (_event, authToken: string, fileId: string) => {
      await requireOwner(authToken);
      const temporary = path.join(
        app.getPath("temp"),
        `oil-pos-drive-${Date.now()}.oilbackup`,
      );
      await required(drive, "Google Drive service").download(fileId, temporary);
      try {
        return await restoreBackup(temporary);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    },
  );
  ipcMain.handle("fbr:token-status", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return required(fbrSync, "FBR sync service").tokenStatus();
  });
  ipcMain.handle(
    "fbr:set-token",
    async (
      _event,
      authToken: string,
      value: string,
      environment?: "SANDBOX" | "PRODUCTION",
    ) => {
      await requireOwner(authToken);
      return required(fbrSync, "FBR sync service").setToken(value, environment);
    },
  );
  ipcMain.handle(
    "fbr:clear-token",
    async (
      _event,
      authToken: string,
      environment?: "SANDBOX" | "PRODUCTION",
    ) => {
      await requireOwner(authToken);
      return required(fbrSync, "FBR sync service").clearToken(environment);
    },
  );
  ipcMain.handle("fbr:queue", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return required(fbrSync, "FBR sync service").list();
  });
  ipcMain.handle("fbr:test-connection", async (_event, authToken: string, environment?: "SANDBOX" | "PRODUCTION") => {
    await requireOwner(authToken);
    return required(fbrSync, "FBR sync service").testConnection(environment);
  });
  ipcMain.handle("fbr:retry", async (_event, authToken: string, id: string) => {
    await requireOwner(authToken);
    return required(fbrSync, "FBR sync service").retry(id);
  });
  ipcMain.handle(
    "fbr:validate",
    async (_event, authToken: string, saleId: string, userId: string) => {
      await requireOwner(authToken);
      return required(fbrSync, "FBR sync service").validate(saleId, userId);
    },
  );
  ipcMain.handle(
    "fbr:submit",
    async (_event, authToken: string, saleId: string, userId: string) => {
      await requireOwner(authToken);
      return required(fbrSync, "FBR sync service").submit(saleId, userId);
    },
  );
  ipcMain.handle("fbr:sync-now", async (_event, authToken: string) => {
    await requireOwner(authToken);
    return required(fbrSync, "FBR sync service").processPending();
  });
}

async function restoreBackup(filePath: string) {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    path.extname(filePath).toLowerCase() !== ".oilbackup"
  )
    throw new Error("Invalid backup path.");
  const confirmation = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    title: "Restore database backup",
    message: "Restore this backup and replace the current database?",
    detail:
      "Oil POS will first back up the current database, verify the selected backup, restore it, and restart.",
    buttons: ["Cancel", "Restore and restart"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (confirmation.response !== 1) return { canceled: true };
  await required(restoreService, "Restore service").restore(filePath);
  app.relaunch();
  app.exit(0);
  return { canceled: false };
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} is not ready.`);
  return value;
}
async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function requireOwner(authToken: string) {
  if (
    typeof authToken !== "string" ||
    authToken.length < 20 ||
    authToken.length > 200
  )
    throw new Error("Owner authentication is required.");
  const session = await required(databaseClient, "Database").session.findUnique(
    {
      where: {
        tokenHash: createHash("sha256").update(authToken).digest("hex"),
      },
      select: {
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            isActive: true,
            deletedAt: true,
            role: { select: { code: true } },
          },
        },
      },
    },
  );
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !session.user.isActive ||
    session.user.deletedAt ||
    session.user.role.code !== "OWNER"
  )
    throw new Error("An active owner session is required for this operation.");
}
function serializeBackup(row: {
  id: string;
  fileName: string;
  localPath: string;
  checksumSha256: string;
  sizeBytes: number;
  kind: string;
  driveFileId: string | null;
  driveUploadedAt: Date | null;
  createdAt: Date;
}) {
  return {
    ...row,
    createdAt: coerceDate(row.createdAt).toISOString(),
    driveUploadedAt: row.driveUploadedAt ? coerceDate(row.driveUploadedAt).toISOString() : null,
  };
}

function coerceDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(value)
      ? `${value.includes(" ") ? value.replace(" ", "T") : `${value}T12:00:00`}.000Z`
      : value;
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date(0);
}

app.setName("Oil Agency POS");
if (process.platform === "win32")
  app.setAppUserModelId("com.umarmalik.oil-agency-pos");

app
  .whenReady()
  .then(async () => {
    await startApi();
    registerPrintHandlers();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error) => {
    void reportStartupError(error).finally(() => app.quit());
  });

process.on("uncaughtException", (error) => {
  void reportStartupError(error).finally(() => app.quit());
});

process.on("unhandledRejection", (reason) => {
  void reportStartupError(reason).finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  if (jobTimer) clearInterval(jobTimer);
  stopDailyClosingScheduler?.();
  apiServer?.close();
});
