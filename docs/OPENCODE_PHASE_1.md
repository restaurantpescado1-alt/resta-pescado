# OpenCode Task — Phase 1 Foundation

## Objective

Implement the smallest production-shaped vertical slice: public menu read, owner login, one protected dish-price update, one protected R2 image replacement, and an audit trail.

## Stack

```text
Next.js
TypeScript strict
Tailwind CSS
Cloudflare Workers
Cloudflare D1
Cloudflare R2
Better Auth
Drizzle ORM
Zod
Vitest
Playwright
```

Use the stable OpenNext Cloudflare adapter. Pin compatible versions and document them. Do not use beta deployment tooling unless compatibility is proven.

## Routes

```text
/
/menu
/admin/login
/admin
/admin/menu
/api/auth/[...all]
```

## Requirements

- French public UI.
- Public sign-up disabled; one owner role.
- Local D1 migrations and development seed.
- Server-side authorization on every admin operation.
- Update positive integer price using Zod.
- Upload JPEG/PNG/WebP with strict type/size validation.
- Store images in R2 with randomized keys.
- Replace safely and write audit logs.
- Useful public error state if D1 or R2 fails.
- No secrets in source control.

## Tests

- Anonymous admin access redirects or returns 401/403.
- Anonymous writes fail.
- Owner login succeeds.
- Invalid/negative prices fail; a valid update persists and becomes public.
- Invalid/oversized image fails; valid replacement succeeds.
- Audit log contains price and image actions.
- Lint, typecheck, unit tests, build, Cloudflare preview, and Playwright smoke tests pass.

## Do not build now

No final visual design, full CRUD, social integration, live availability, online ordering, payment, WhatsApp ordering, online reservations, loyalty, promotions, POS, table ordering, multiple admins, or AI generation.
