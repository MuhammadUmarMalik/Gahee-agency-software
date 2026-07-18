/// <reference types="vite/client" />

interface Window {
  agencyDesktop?: { apiBaseUrl: string; platform: string; printThermal(html: string): Promise<{ success: boolean }>; printA4(html: string): Promise<{ success: boolean }>; printReport(html: string): Promise<{ success: boolean; canceled: boolean }>; printPdf(html: string, suggestedName: string): Promise<{ canceled: boolean; filePath?: string }>; createBackup(): Promise<{ canceled: boolean; filePath?: string; fileName?: string; sizeBytes?: number; createdAt?: string }> };
}
