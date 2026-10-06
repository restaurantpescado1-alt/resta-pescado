CREATE TABLE `bundled_gallery_images` (
	`slug` text PRIMARY KEY NOT NULL,
	`alt_text_fr` text NOT NULL,
	`caption_fr` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`edit_token` text
);
--> statement-breakpoint
ALTER TABLE `gallery_images` ADD `caption_fr` text;--> statement-breakpoint
ALTER TABLE `gallery_images` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `gallery_images` ADD `edit_token` text;--> statement-breakpoint
ALTER TABLE `menu_categories` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `menu_categories` ADD `edit_token` text;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `edit_token` text;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `edit_token` text;