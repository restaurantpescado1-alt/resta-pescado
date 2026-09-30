# V1 Technical Architecture

## Runtime

```text
Public visitor -> Next.js on Cloudflare Workers -> read-only D1 + R2
Owner -> Better Auth -> protected server actions -> Zod -> D1 + R2 + audit log
```

## Data model

- Better Auth tables: users, sessions, accounts, verification
- profiles: id, role=owner, display_name, timestamps
- menu_categories: id, name_fr, slug, sort_order, is_visible, timestamps
- menu_items: id, category_id, name_fr, description_fr, price_da, image_key, is_featured, is_visible, sort_order, timestamps
- site_settings: single row for phone, address, maps, hours, delivery, family, hero content
- gallery_images: id, image_key, alt_text_fr, sort_order, is_visible, timestamps
- audit_logs: actor, action, entity type/id, metadata, created_at

## Storage

Use a private R2 bucket. Upload through authenticated server endpoints only. Store randomized object keys in D1.

```text
menu/{year}/{uuid}.webp
gallery/{year}/{uuid}.webp
hero/{year}/{uuid}.webp
video/{year}/{uuid}.webm
backups/database/{date}.json
```

Use the stable OpenNext Cloudflare adapter for production. Do not adopt beta runtime tooling without a compatibility test.
