CREATE TABLE `gallery_images` (
	`id` text PRIMARY KEY NOT NULL,
	`image_key` text NOT NULL,
	`alt_text_fr` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gallery_images_sort_order_idx` ON `gallery_images` (`sort_order`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name_fr` text NOT NULL,
	`description_fr` text,
	`price_da` integer NOT NULL,
	`image_key` text,
	`fish_reference_slug` text,
	`is_featured` integer DEFAULT false NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `menu_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "menu_items_price_da_positive" CHECK("__new_menu_items"."price_da" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_menu_items`("id", "category_id", "name_fr", "description_fr", "price_da", "image_key", "is_featured", "is_visible", "sort_order", "created_at", "updated_at") SELECT "id", "category_id", "name_fr", "description_fr", "price_da", "image_key", "is_featured", "is_visible", "sort_order", "created_at", "updated_at" FROM `menu_items`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `menu_items_category_id_idx` ON `menu_items` (`category_id`);--> statement-breakpoint
CREATE INDEX `menu_items_price_da_idx` ON `menu_items` (`price_da`);