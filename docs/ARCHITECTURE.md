# V1 Technical Architecture

## Runtime

```text
Public visitor -> Next.js on Cloudflare Workers -> read-only D1 + R2
Owner -> Better Auth -> protected server actions -> Zod -> D1 + R2 + audit log
```

## Data model

- Better Auth tables: users, sessions, accounts, verification
- profiles: id, role=owner, display_name, timestamps
- menu_categories: id, name_fr, slug, sort_order, is_visible, version, edit_token, timestamps
- menu_items: id, category_id, name_fr, description_fr, price_da, image_key, is_featured, is_visible, sort_order, version, edit_token, timestamps
- site_settings: single row for phone, address, maps, hours, delivery, family, hero content, version, edit_token
- gallery_images: id, image_key, alt_text_fr, caption_fr, sort_order, is_visible, version, edit_token, timestamps
- bundled_gallery_images: slug-keyed mirror of the photographs committed to the repository,
  with caption_fr, sort_order, is_visible, version, edit_token. No `image_key`: these photographs
  are files in `public/`, not objects in R2.
- audit_logs: actor, action, entity type/id, metadata, created_at

## Concurrency: one guard, applied the same way everywhere

Every owner-editable table carries `version` and `edit_token`. A page is rendered from the rows
it read, and every form sends back the `version` it was given. A write is therefore
`UPDATE ... SET ..., version = expected + 1 WHERE id = ? AND version = expected`, inside the same
batch as the audit insert, and the batch is committed only if the update affected exactly one row.

The alternatives were rejected deliberately:

- **Last write wins.** Two open tabs, the older one overwriting the newer one, with an audit log
  that records both as legitimate. For a single-owner restaurant the realistic case is one tab
  left open over lunch, and that is exactly the case it gets wrong.
- **Comparing a value instead of a version.** "Only if the description is still what I read"
  is the same guard with a worse interface: it cannot tell the owner what changed, and it does not
  work for a field whose value the owner did not edit.
- **`SELECT` then `UPDATE`.** A check that is not in the same transaction as the write is a
  suggestion. `src/db/atomic.ts` is the only place that commits, and it takes the exact expected
  row count as an argument.

`edit_token` is what makes the batch exact rather than approximate. D1 has no `UPDATE ...
RETURNING`, so the row count is read from the batch's own result and the transaction is rolled
back if it is not the expected number; the token is carried so a caller cannot satisfy the check
by matching a row it did not mean to touch.

### Reordering is guarded differently, and not perfectly

A reorder is one `UPDATE ... SET sort_order = CASE ... END` per row, with no version predicate,
because a row has no single version to compare: the owner is replacing the order of the whole
collection at once. The exact-count check runs *after* the batch has committed, so a request
whose `order` list names an id that does not exist, or omits one that does, can be partially
applied before the mismatch is reported. The mitigation is in the payload, not the transaction:
`reorderDishesAction` and `reorderCategoriesAction` validate that the client sent a list whose
members are exactly the ids the client was shown, in a real browser this means the whole
collection, and the repository still verifies the count before the audit row is written. The
remaining honest statement is that this one write is not atomic against a malformed request.

## Bundled photographs are D1 rows and not objects

`docs/GALLERY.md` covers the editorial rules. The architectural consequence is worth repeating:
a bundled photograph may be described, captioned, hidden and reordered, and none of those writes
touches R2. Only `gallery_images` rows hold an `image_key`, and only those may be deleted from the
bucket. Anything that treats the two tables alike will eventually `media.delete()` a key that was
never in R2.

`bundled_gallery_images` is populated from `docs/gallery-manifest.json`, which is read at build
time, so the rows are created lazily rather than by the migration:

- The admin gallery page calls `ensureBundledGalleryRows` **before** it reads. A photograph with
  no row merges from the manifest with `version: 0`, and 0 can never be the version of a real row,
  so a page showing 0 would send an edit that is refused as stale. Creating the rows on load is
  what makes the first caption an owner types succeed.
- The server action calls it too, as a safety net for a write that arrives from an older tab.
- A write carrying `expectedVersion: 0` is refused. That page was rendered before the row
  existed, so it cannot know whether somebody has edited the photograph since; substituting the
  current version would disable the guard for the photograph most likely to need it. A reload
  costs one request and is the honest answer.

## Auth calls made from server actions

`src/app/admin/owner-actions.ts` calls `getAuth().api.signOut(...)` and
`getAuth().api.changePassword(...)` directly rather than through `/api/auth/*`. Those endpoint
responses carry `Set-Cookie` headers, and a direct call discards them. The `nextCookies()` plugin
— last in the plugin list, on purpose — is what copies them into the Next.js response. Without
it there is no error and no failing test: `revokeOtherSessions` has already deleted the session
the browser is still holding, so changing the password silently signs the owner out. That is
recorded in `src/auth.ts` next to the plugin list.

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

## Where this version is weaker than it looks

Stated here rather than discovered later, because each of these is a real gap with a real
consequence and none of them is fixed by adding code:

- **Three dish controls skip the version guard.** Replacing a dish photograph, removing one and
  toggling "featured" were written in Phase 2, before the guard existed. Each writes a single
  column or sets a single flag, so a competing write to the *same* field is a lost update in a
  narrow sense and nothing else. They are isolated in `src/components/admin/dish-image-controls.tsx`
  so the guard can be added to three call sites rather than to the whole editor.
- **Reorder is not atomic against a malformed payload.** See above.
- **`version: 0` on a bundled photograph means "no row yet", not "unmodified".** It is a
  sentinel, not a version, and the admin page removes the situation rather than teaching the
  guard to accept it.
- **The audit log is append-only in the application but not in the database.** Nothing in the
  code prevents an UPDATE or a DELETE against `audit_logs` by anything else with D1 credentials;
  the guarantee depends on the Worker being the only writer.
- **One owner, no second factor.** The password form is the only credential and there is no email
  delivery, so the practical ceiling on account recovery is the local seed script. See
  `docs/SECURITY.md`.
