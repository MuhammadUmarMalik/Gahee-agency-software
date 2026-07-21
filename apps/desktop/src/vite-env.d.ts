/// <reference types="vite/client" />

type DesktopBackup = {
  id: string;
  fileName: string;
  localPath: string;
  checksumSha256: string;
  sizeBytes: number;
  kind: "MANUAL" | "AUTOMATIC" | "PRE_RESTORE" | "IMPORTED";
  driveFileId: string | null;
  driveUploadedAt: string | null;
  createdAt: string;
};

type FbrQueueRow = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REQUIRES_REVIEW";
  attempts: number;
  nextRunAt: string;
  lastError: string | null;
  createdAt: string;
  sale: null | {
    id: string;
    invoiceNumber: string;
    soldAt: string;
    fbrStatus: string;
    fbrInvoiceNumber: string | null;
    fbrError: string | null;
    fbrSubmittedAt: string | null;
  };
};

interface Window {
  agencyDesktop?: {
    apiBaseUrl: string;
    platform: string;
    printThermal(html: string): Promise<{ success: boolean }>;
    printA4(html: string): Promise<{ success: boolean }>;
    printReport(html: string): Promise<{ success: boolean; canceled: boolean }>;
    printPdf(html: string, suggestedName: string): Promise<{ canceled: boolean; filePath?: string }>;
    createBackup(authToken: string): Promise<DesktopBackup>;
    listBackups(authToken: string): Promise<DesktopBackup[]>;
    importBackup(authToken: string): Promise<{ canceled: boolean; backup?: DesktopBackup }>;
    restoreBackup(authToken: string, filePath: string): Promise<{ canceled: boolean }>;
    googleStatus(authToken: string): Promise<{ connected: boolean; clientConfigured: boolean }>;
    connectGoogleDrive(authToken: string, clientId: string): Promise<{ connected: boolean }>;
    disconnectGoogleDrive(authToken: string): Promise<{ connected: boolean }>;
    uploadPendingBackups(authToken: string): Promise<{ queued: boolean }>;
    listGoogleBackups(authToken: string): Promise<Array<{ id: string; name: string; size?: string; createdTime?: string }>>;
    restoreGoogleBackup(authToken: string, fileId: string): Promise<{ canceled: boolean }>;
    fbrTokenStatus(authToken: string): Promise<{ configured: boolean; environment: "SANDBOX" | "PRODUCTION"; sandboxConfigured: boolean; productionConfigured: boolean }>;
    setFbrToken(authToken: string, token: string, environment?: "SANDBOX" | "PRODUCTION"): Promise<{ configured: boolean; environment: "SANDBOX" | "PRODUCTION" }>;
    clearFbrToken(authToken: string, environment?: "SANDBOX" | "PRODUCTION"): Promise<{ configured: boolean; environment: "SANDBOX" | "PRODUCTION" }>;
    testFbrConnection(authToken: string, environment?: "SANDBOX" | "PRODUCTION"): Promise<{ environment: "SANDBOX" | "PRODUCTION"; reachable: boolean; authenticated: boolean; httpStatus: number; message: string }>;
    listFbrQueue(authToken: string): Promise<FbrQueueRow[]>;
    retryFbrJob(authToken: string, id: string): Promise<{ queued: boolean }>;
    validateFbrSale(authToken: string, saleId: string, userId: string): Promise<unknown>;
    submitFbrSale(authToken: string, saleId: string, userId: string): Promise<unknown>;
    syncFbrNow(authToken: string): Promise<{ processed: number }>;
  };
}
