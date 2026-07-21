import { contextBridge, ipcRenderer } from "electron";

type FbrEnvironment = "SANDBOX" | "PRODUCTION";

function requiredString(value: string, name: string, maxLength = 4096) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength)
    throw new Error(`${name} is invalid.`);
  return value;
}

function optionalEnvironment(value: FbrEnvironment | undefined) {
  if (value === undefined || value === "SANDBOX" || value === "PRODUCTION")
    return value;
  throw new Error("FBR environment is invalid.");
}

function invoiceHtml(value: string) {
  return requiredString(value, "Invoice document", 4_000_000);
}

contextBridge.exposeInMainWorld("agencyDesktop", {
  apiBaseUrl: "http://127.0.0.1:4317/api",
  platform: process.platform,
  printThermal: (html: string) => ipcRenderer.invoke("invoice:thermal", invoiceHtml(html)),
  printA4: (html: string) => ipcRenderer.invoke("invoice:a4", invoiceHtml(html)),
  printReport: (html: string) => ipcRenderer.invoke("report:print", invoiceHtml(html)),
  printPdf: (html: string, suggestedName: string) => ipcRenderer.invoke("invoice:pdf", invoiceHtml(html), requiredString(suggestedName, "PDF name", 255)),
  createBackup: (authToken: string) => ipcRenderer.invoke("backup:create", requiredString(authToken, "Auth token", 512)),
  listBackups: (authToken: string) => ipcRenderer.invoke("backup:list", requiredString(authToken, "Auth token", 512)),
  importBackup: (authToken: string) => ipcRenderer.invoke("backup:import", requiredString(authToken, "Auth token", 512)),
  restoreBackup: (authToken: string, filePath: string) => ipcRenderer.invoke("backup:restore", requiredString(authToken, "Auth token", 512), requiredString(filePath, "Backup path", 4096)),
  googleStatus: (authToken: string) => ipcRenderer.invoke("google:status", requiredString(authToken, "Auth token", 512)),
  connectGoogleDrive: (authToken: string, clientId: string) => ipcRenderer.invoke("google:connect", requiredString(authToken, "Auth token", 512), requiredString(clientId, "Google client ID", 512)),
  disconnectGoogleDrive: (authToken: string) => ipcRenderer.invoke("google:disconnect", requiredString(authToken, "Auth token", 512)),
  uploadPendingBackups: (authToken: string) => ipcRenderer.invoke("google:upload-pending", requiredString(authToken, "Auth token", 512)),
  listGoogleBackups: (authToken: string) => ipcRenderer.invoke("google:list-backups", requiredString(authToken, "Auth token", 512)),
  restoreGoogleBackup: (authToken: string, fileId: string) => ipcRenderer.invoke("google:restore", requiredString(authToken, "Auth token", 512), requiredString(fileId, "Drive file ID", 512)),
  fbrTokenStatus: (authToken: string) => ipcRenderer.invoke("fbr:token-status", requiredString(authToken, "Auth token", 512)),
  setFbrToken: (authToken: string, token: string, environment?: FbrEnvironment) => ipcRenderer.invoke("fbr:set-token", requiredString(authToken, "Auth token", 512), requiredString(token, "FBR token", 4096), optionalEnvironment(environment)),
  clearFbrToken: (authToken: string, environment?: FbrEnvironment) => ipcRenderer.invoke("fbr:clear-token", requiredString(authToken, "Auth token", 512), optionalEnvironment(environment)),
  testFbrConnection: (authToken: string, environment?: FbrEnvironment) => ipcRenderer.invoke("fbr:test-connection", requiredString(authToken, "Auth token", 512), optionalEnvironment(environment)),
  listFbrQueue: (authToken: string) => ipcRenderer.invoke("fbr:queue", requiredString(authToken, "Auth token", 512)),
  retryFbrJob: (authToken: string, id: string) => ipcRenderer.invoke("fbr:retry", requiredString(authToken, "Auth token", 512), requiredString(id, "FBR job ID", 128)),
  validateFbrSale: (authToken: string, saleId: string, userId: string) => ipcRenderer.invoke("fbr:validate", requiredString(authToken, "Auth token", 512), requiredString(saleId, "Sale ID", 128), requiredString(userId, "User ID", 128)),
  submitFbrSale: (authToken: string, saleId: string, userId: string) => ipcRenderer.invoke("fbr:submit", requiredString(authToken, "Auth token", 512), requiredString(saleId, "Sale ID", 128), requiredString(userId, "User ID", 128)),
  syncFbrNow: (authToken: string) => ipcRenderer.invoke("fbr:sync-now", requiredString(authToken, "Auth token", 512)),
});
