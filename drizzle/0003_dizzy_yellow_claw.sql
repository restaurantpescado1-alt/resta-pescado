ALTER TABLE `gallery_images` ADD `media_provider` text DEFAULT 'r2' NOT NULL;--> statement-breakpoint
ALTER TABLE `gallery_images` ADD `provider_asset_id` text;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `media_provider` text DEFAULT 'r2' NOT NULL;--> statement-breakpoint
ALTER TABLE `menu_items` ADD `provider_asset_id` text;--> statement-breakpoint
/*
 * Migration 0003 is additive on purpose: the two new columns only ever describe
 * the store a row's image lives in. Existing rows are R2 rows, where the object
 * key is the identifier, so `provider_asset_id` is backfilled from `image_key`.
 * Everything uploaded after this migration records `imagekit` and the ImageKit
 * `fileId`. No database CHECK is attached to `media_provider`: SQLite cannot add
 * one to an existing table, so the closed set (`r2` | `imagekit`) is enforced by
 * the writing code, which is the only thing that ever writes it.
 */
UPDATE `menu_items` SET `provider_asset_id` = `image_key` WHERE `media_provider` = 'r2' AND `image_key` IS NOT NULL;--> statement-breakpoint
UPDATE `gallery_images` SET `provider_asset_id` = `image_key` WHERE `media_provider` = 'r2';