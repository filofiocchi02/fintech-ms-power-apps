CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`app` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_ref` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`before_json` text,
	`after_json` text,
	`request_id` text
);
--> statement-breakpoint
CREATE INDEX `audit_events_subject_idx` ON `audit_events` (`subject_type`,`subject_ref`);--> statement-breakpoint
CREATE INDEX `audit_events_occurred_at_idx` ON `audit_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_app_idx` ON `audit_events` (`app`);--> statement-breakpoint
CREATE TABLE `kyc_case_workflow` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_case_ref` text NOT NULL,
	`customer_ref` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`assignee_id` text,
	`opened_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`decision_reason` text,
	`decided_by` text,
	`decided_at` integer,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kyc_case_workflow_provider_case_ref_idx` ON `kyc_case_workflow` (`provider_case_ref`);--> statement-breakpoint
CREATE INDEX `kyc_case_workflow_status_idx` ON `kyc_case_workflow` (`status`);--> statement-breakpoint
CREATE INDEX `kyc_case_workflow_assignee_idx` ON `kyc_case_workflow` (`assignee_id`);--> statement-breakpoint
CREATE TABLE `refund_case_workflow` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_ref` text NOT NULL,
	`customer_ref` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`reason` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`decision_reason` text,
	`execution_ref` text,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refund_case_workflow_idempotency_key_idx` ON `refund_case_workflow` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `refund_case_workflow_payment_ref_idx` ON `refund_case_workflow` (`payment_ref`);--> statement-breakpoint
CREATE INDEX `refund_case_workflow_status_idx` ON `refund_case_workflow` (`status`);