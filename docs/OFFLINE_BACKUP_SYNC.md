# Offline backup and synchronization

## Local backups

Oil POS commits operational transactions to SQLite before any network work. Electron creates consistent snapshots with `VACUUM INTO`, encrypts them with AES-256-GCM, and stores them in the application user-data `backups` directory (outside the installed application).

The encryption key and external-service tokens are protected with Electron `safeStorage`. Encrypted backup files from another Windows installation cannot be opened unless that installation has the same protected backup key.

Retention keeps the union of the newest restore point for 7 calendar days, 4 ISO weeks, and 6 calendar months. Imported and pre-restore backups are not automatically pruned.

Restore performs these steps:

1. Authenticate and decrypt the backup.
2. Verify its SHA-256 checksum.
3. Run `PRAGMA integrity_check` on a temporary database.
4. Create an encrypted pre-restore backup of the current database.
5. Close the API and SQLite connection.
6. Replace and verify the database.
7. Roll back to the previous database if replacement verification fails.
8. Restart Oil POS.

## Google Drive setup

Google Drive requires a free Google Cloud project and a Desktop OAuth 2.0 client ID:

1. Enable the Google Drive API in Google Cloud Console.
2. Configure the OAuth consent screen for the shop owner's Google account.
3. Create an OAuth client with application type **Desktop app**.
4. In **Settings → Backup & data**, enter the client ID and select **Connect Google**.
5. Complete consent in the system browser.

Oil POS requests only the `drive.file` scope and creates an `Oil POS Backups` folder. Refresh/access tokens are encrypted by the operating system and are never returned to the renderer. Failed uploads remain in the SQLite background queue.

## FBR synchronization

Enter the PRAL/FBR-issued token under **Settings → Agency details → FBR digital invoicing**. The token is sent directly to Electron main-process secure storage and is never returned to the renderer.

When FBR integration is enabled, checkout commits the sale, stock, payments, ledgers, cashbook, journal and FBR queue item in one local transaction. The worker validates and submits queued invoices in chronological order. Network, timeout and FBR 5xx errors retry with exponential backoff. Authentication, payload and validation errors require owner review.
