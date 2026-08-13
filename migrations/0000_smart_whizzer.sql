CREATE TABLE `app_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`issued_to` text NOT NULL,
	`common_name` text NOT NULL,
	`validity_days` integer NOT NULL,
	`certificate_pem` text NOT NULL,
	`status` text NOT NULL,
	`expires_on` text NOT NULL,
	`fingerprint_sha256` text,
	`serial_number` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`issued_to`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hostname_associations` (
	`hostname` text PRIMARY KEY NOT NULL,
	`mtls_certificate_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL
);
