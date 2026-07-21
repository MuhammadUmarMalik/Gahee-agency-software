CREATE TABLE IF NOT EXISTS `AuditLog` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`action` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text,
	`beforeJson` text,
	`afterJson` text,
	`ipAddress` text,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `AuditLog_userId_createdAt_idx` ON `AuditLog` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `AuditLog_entityType_entityId_createdAt_idx` ON `AuditLog` (`entityType`,`entityId`,`createdAt`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Purchase` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceNumber` text NOT NULL,
	`supplierInvoice` text,
	`supplierInvoiceNormalized` text,
	`supplierId` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`paymentStatus` text NOT NULL,
	`subtotalMinor` integer NOT NULL,
	`discountMinor` integer DEFAULT 0 NOT NULL,
	`taxMinor` integer DEFAULT 0 NOT NULL,
	`transportMinor` integer DEFAULT 0 NOT NULL,
	`loadingMinor` integer DEFAULT 0 NOT NULL,
	`otherExpenseMinor` integer DEFAULT 0 NOT NULL,
	`totalMinor` integer NOT NULL,
	`paidMinor` integer DEFAULT 0 NOT NULL,
	`dueDate` datetime,
	`notes` text,
	`purchasedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `Purchase_supplierId_supplierInvoice_key` ON `Purchase` (`supplierId`,`supplierInvoice`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `Purchase_purchasedAt_status_idx` ON `Purchase` (`purchasedAt`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `Purchase_supplierId_purchasedAt_idx` ON `Purchase` (`supplierId`,`purchasedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `Purchase_supplierId_supplierInvoiceNormalized_idx` ON `Purchase` (`supplierId`,`supplierInvoiceNormalized`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `Purchase_invoiceNumber_key` ON `Purchase` (`invoiceNumber`);
