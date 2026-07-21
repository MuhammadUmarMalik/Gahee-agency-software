PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__Purchase_timestamp_defaults` (
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
INSERT INTO `__Purchase_timestamp_defaults` (
	`id`,
	`invoiceNumber`,
	`supplierInvoice`,
	`supplierInvoiceNormalized`,
	`supplierId`,
	`status`,
	`paymentStatus`,
	`subtotalMinor`,
	`discountMinor`,
	`taxMinor`,
	`transportMinor`,
	`loadingMinor`,
	`otherExpenseMinor`,
	`totalMinor`,
	`paidMinor`,
	`dueDate`,
	`notes`,
	`purchasedAt`,
	`createdById`,
	`createdAt`,
	`updatedAt`
)
SELECT
	`id`,
	`invoiceNumber`,
	`supplierInvoice`,
	`supplierInvoiceNormalized`,
	`supplierId`,
	COALESCE(`status`, 'POSTED'),
	`paymentStatus`,
	`subtotalMinor`,
	COALESCE(`discountMinor`, 0),
	COALESCE(`taxMinor`, 0),
	COALESCE(`transportMinor`, 0),
	COALESCE(`loadingMinor`, 0),
	COALESCE(`otherExpenseMinor`, 0),
	`totalMinor`,
	COALESCE(`paidMinor`, 0),
	`dueDate`,
	`notes`,
	COALESCE(`purchasedAt`, CURRENT_TIMESTAMP),
	`createdById`,
	COALESCE(`createdAt`, `purchasedAt`, CURRENT_TIMESTAMP),
	COALESCE(`updatedAt`, `createdAt`, `purchasedAt`, CURRENT_TIMESTAMP)
FROM `Purchase`;
--> statement-breakpoint
DROP TABLE `Purchase`;--> statement-breakpoint
ALTER TABLE `__Purchase_timestamp_defaults` RENAME TO `Purchase`;--> statement-breakpoint
CREATE UNIQUE INDEX `Purchase_supplierId_supplierInvoice_key` ON `Purchase` (`supplierId`,`supplierInvoice`);--> statement-breakpoint
CREATE INDEX `Purchase_purchasedAt_status_idx` ON `Purchase` (`purchasedAt`,`status`);--> statement-breakpoint
CREATE INDEX `Purchase_supplierId_purchasedAt_idx` ON `Purchase` (`supplierId`,`purchasedAt`);--> statement-breakpoint
CREATE INDEX `Purchase_supplierId_supplierInvoiceNormalized_idx` ON `Purchase` (`supplierId`,`supplierInvoiceNormalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `Purchase_invoiceNumber_key` ON `Purchase` (`invoiceNumber`);--> statement-breakpoint
PRAGMA foreign_key_check;--> statement-breakpoint
PRAGMA foreign_keys=ON;
