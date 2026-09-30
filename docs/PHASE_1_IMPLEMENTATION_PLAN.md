# Phase 1 Implementation Plan

Authoritative spec: `docs/OPENCODE_PHASE_1.md`. This plan records the sequence and the
decisions that the spec leaves open. Nothing here adds scope beyond the spec.

## Pinned versions

Compatibility is the main risk in Phase 1, so versions are pinned explicitly and the
reasoning is recorded here.

```text
next                     16.3.7
@opennextjs/cloudflare   1.20.7   (stable 1.x line, not the 2.x beta)
wrangler                 4.144.0
react / react-dom        19.3.0
typescript               5.9.3    (5.x, not the 7.x native port)
tailwindcss              4.3.3
drizzle-orm              0.45.3
drizzle-kit              0.31.11
better-auth              1.7.6
zod                      4.6.5
vitest                   5.0.2
@playwright/test          1.63.0
```

Notes:

- `@opennextjs/cloudflare@1.20.7` declares `next >=15.5.26 <16 || >=16.3.6`, so Next
  16.3.7 is inside the supported range.
- `better-auth@1.7.6` declares `next ^14 || ^15 || ^16` and `drizzle-orm ^0.45.2`.
- TypeScript stays on 5.9.x. TypeScript 7 is a different compiler implementation and
  Next's and eslint-config-next's type-aware rules are not verified against it here.
- Edge runtime is not used anywhere; OpenNext Cloudflare does not support it.

## Architecture

```text
Browser
  |
  +-- / , /menu ......... server component -> D1 read (categories, items) -> R2 image URL
  +-- /admin/login ....... Better Auth email+password, public sign-up disabled
  +-- /admin, /admin/menu  server component -> requireOwner() -> session + role check
  +-- /api/auth/* ........ Better Auth route handler
  +-- /api/media/* ....... authenticated-agnostic read of an R2 object by key (public images)

Server actions (the only write path)
  updateDishPrice  -> Zod -> D1 update -> audit_logs insert
  replaceDishImage -> Zod -> R2 put (new random key) -> D1 update -> R2 delete old -> audit_logs insert
```

Ordering for image replacement follows `docs/SECURITY.md`: upload first, update D1
second, delete the old object only after the D1 write succeeds. If the D1 write fails
the new object is removed so no orphan is left behind.

## Data model

Tables defined in `src/db/schema.ts`, migrations generated with drizzle-kit into
`drizzle/` and applied to local D1 through wrangler:

```text
user, session, account, verification   Better Auth
profiles                               role = 'owner', display_name
menu_categories                        name_fr, slug, sort_order, is_visible
menu_items                             name_fr, description_fr, price_da, image_key, ...
site_settings                          single row, Phase 1 minimal
audit_logs                             actor, action, entity_type, entity_id, metadata
```

`gallery_images` is declared in the architecture doc but belongs to Milestone 2/3 and
is not created in Phase 1, because nothing in the Phase 1 vertical slice reads it.

## Authorization

`requireOwner()` is the single gate. It reads the Better Auth session from the request,
loads the profile row, checks `role === 'owner'`, and returns the profile. Every admin
page calls it. Every server action calls it before any validation or I/O. Anonymous
callers get a redirect to `/admin/login` from pages and a thrown error from actions.

Rate limiting is required by `docs/SECURITY.md`. Phase 1 uses Better Auth's built-in
rate limiting for the login endpoint and a small D1-backed limiter for the two admin
server actions. It is deliberately simple: a fixed window keyed on actor and action.

## Image validation

`validateImageUpload()` in `src/lib/images.ts` is a pure function, so it is unit tested
without R2. It checks, in order:

1. declared MIME type is one of `image/jpeg`, `image/png`, `image/webp`
2. byte length within the 2 MiB limit
3. magic-byte signature matches the declared type
4. dimensions parsed from the container, both within 100..6000 px

Only then is anything written to R2. The key is `menu/{year}/{uuid}.{ext}` with a
`crypto.randomUUID()` value, per the architecture doc.

## Public error state

`/menu` and `/` read D1 and R2. A read failure is caught and rendered as a French
"service temporairement indisponible" state with a retry affordance, instead of
propagating a Worker exception. This is the "useful public error state" requirement.

## Tests

Vitest (unit, no network, no Worker runtime):

```text
price validation         negative, zero, decimal, non-numeric, upper bound, valid
image validation         wrong type, oversize, bad signature, out-of-range dimensions, valid x3
r2 key generation        shape, randomness, extension
rate limiter             window resets, limit enforced
menu repository          visible-only filtering, ordering, price persistence (in-memory D1)
audit repository         one row per action with metadata
```

Playwright (against `wrangler dev` on the built OpenNext output, local D1 and local R2):

```text
public home and menu render the seeded dish and price
anonymous /admin and /admin/menu redirect to /admin/login
anonymous write attempt does not change the price
owner login succeeds and lands on /admin
invalid price is rejected and does not persist
valid price update persists and is visible publicly
invalid image is rejected, valid replacement succeeds
audit log lists the price and image actions
```

Playwright needs a running server against a prepared local database, so the
`test:e2e` script applies migrations, seeds, starts `wrangler dev` against the built
worker, and runs the suite with a seeded owner credential read from the environment.
The owner password is never committed; `.env.example` documents it and the seed reads
it from the environment.

## Steps

1. Scaffold at the repo root, preserving `README.md` and `docs/`.
2. Tooling: tsconfig strict, eslint, tailwind v4 postcss, vitest, playwright, wrangler.
3. Schema, drizzle config, migrations, seed script.
4. Cloudflare context helper, db client, R2 helper.
5. Better Auth config and route handler, sign-up disabled.
6. Public pages.
7. Admin pages and `requireOwner`.
8. Server actions with Zod, R2 replacement, audit logs.
9. `.env.example`, `.gitignore`.
10. Vitest suites, then Playwright suite.
11. lint, typecheck, test, build, preview, e2e. Fix until all pass.
12. README, then commit on `phase-1-foundation`.
