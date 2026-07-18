import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agencyDesktop", {
  apiBaseUrl: "http://127.0.0.1:4317/api",
  platform: process.platform,
  printThermal: (html: string) => ipcRenderer.invoke("invoice:thermal", html),
  printA4: (html: string) => ipcRenderer.invoke("invoice:a4", html),
  printReport: (html: string) => ipcRenderer.invoke("report:print", html),
  printPdf: (html: string, suggestedName: string) => ipcRenderer.invoke("invoice:pdf", html, suggestedName),
  createBackup: () => ipcRenderer.invoke("backup:create"),
});
