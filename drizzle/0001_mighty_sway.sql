ALTER TABLE `Sale` ADD COLUMN `fbrRequestJson` text;--> statement-breakpoint
ALTER TABLE `Sale` ADD COLUMN `fbrQrData` text;--> statement-breakpoint
ALTER TABLE `Sale` ADD COLUMN `fbrRetryCount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `Sale`
SET `fbrStatus` = CASE `fbrStatus`
  WHEN 'pending' THEN 'PENDING'
  WHEN 'submitting' THEN 'SUBMITTING'
  WHEN 'submitted' THEN 'ACCEPTED'
  WHEN 'failed' THEN 'FAILED'
  WHEN 'requires_review' THEN 'REQUIRES_REVIEW'
  WHEN 'rejected' THEN 'REQUIRES_REVIEW'
  WHEN 'validated' THEN 'PENDING'
  WHEN 'validating' THEN 'PENDING'
  WHEN 'NOT_SUBMITTED' THEN 'PENDING'
  ELSE `fbrStatus`
END
WHERE `fbrStatus` != upper(`fbrStatus`) OR `fbrStatus` = 'NOT_SUBMITTED';
