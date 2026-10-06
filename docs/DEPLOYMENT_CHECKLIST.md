# Deployment Checklist

Every step below is local until the last section. Nothing in this document creates a remote
resource, and no step may be skipped by "just deploying it and watching".

## 1. Prerequisites

```text
node -v           # the version in package.json engines
npm ci
npx wrangler whoami
```

Required environment variables — in `.dev.vars` locally, as Worker secrets in production:

| Name | Used for | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | session signing | at least 32 random bytes; changing it signs everybody out |
| `BETTER_AUTH_URL` | callback origin | must be the public origin, scheme included |
| `BETTER_AUTH_TRUSTED_ORIGINS` | CSRF origin check | the public origin |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | CI deploy only | least-privilege token, never in the repository |

If `BETTER_AUTH_SECRET` is absent the build succeeds and every login fails at runtime. Check it
explicitly rather than discovering it on the first request.

## 2. Local verification, in order

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run build:cf
```

All six must pass. `test:e2e` builds the app and runs it under `wrangler` against local D1 and a
local R2 emulator, so it is the gate that proves the Worker runtime works and not only Node.

## 3. Database

Migrations create the schema. They do not create content, and **nothing in the repository currently
provisions production data**:

- `scripts/seed-local.ts` refuses to run against anything but a database under `.wrangler/state`,
  and refuses to run under `NODE_ENV=production`. That guard is deliberate and pinned by
  `tests/unit/seed-guard.test.ts`.
- No migration inserts a dish, a category, the site settings or the owner account. The two
  `INSERT`s in `drizzle/` are the column rewrites of the Phase 2 table rebuild.

A freshly migrated production database is therefore an empty schema: the public menu renders no
dish, and there is no account to log in with. **Provisioning production data is an open item, not
a step in this list**, and it is tracked in `docs/FINAL_REVIEW_CHECKLIST.md`. The options, for
whoever decides:

| Option | What it means | Cost |
| --- | --- | --- |
| Signed remote seed script | Reuse `scripts/approved-menu.ts` and the `hashPassword` call from the local seed, add an explicit `--remote` opt-in flag, keep the "owner row already exists" refusal | Smallest change; the data stays transcribed from one approved source |
| One-time provisioning route | A Worker route enabled by a secret variable, deleted once the owner exists | Works from anywhere; adds a code path that must be removed and verified as removed |
| Manual entry through the dashboard | The owner creates 5 categories and 34 dishes by hand, and needs another way to make the account | Not viable as written: there is no sign-up path at all |

Local preparation, which is the same schema and the same data:

```bash
npm run db:migrate:local
npm run db:seed:local
```

Remote schema only — read the output before applying it:

```bash
npx wrangler d1 migrations list resta-pescado-db --remote
npx wrangler d1 migrations apply resta-pescado-db --remote
```

The re-seed is insert-only for owner decisions: `bundled_gallery_images` alt text, captions and
visibility are never overwritten, because those are choices made in the dashboard.

## 4. Before deploying

- [ ] `BETTER_AUTH_SECRET` is set as a Worker secret, not in `wrangler.toml`.
- [ ] `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` are the final origin. A wrong origin here
      fails sign-in with an origin error that looks like a credentials problem.
- [ ] The owner account exists, with the menu and the settings. See §3 — this has no script yet.
- [ ] R2 bucket exists, is private, and the Worker binding points at it.
- [ ] `advanced.ipAddress.ipAddressHeaders` is `CF-Connecting-IP` in production. Without it every
      caller shares one rate-limit bucket, and after a few logins all of them are refused.
- [ ] The R2 custom domain or `/api/media` route serves images; a private bucket with no route
      returns 404 for every photograph.
- [ ] D1 Time Travel is understood to be the only backup of the last few days, and a scheduled
      export to R2 (`backups/database/{date}.json`) exists. **Test a restore before launch.**

## 5. Deploy

```bash
npm run build:cf
npx wrangler deploy
```

Then, against the real origin:

- [ ] `/`, `/menu`, `/galerie`, `/a-propos`, `/contact` render with the database empty *and* filled.
- [ ] A dish photograph loads through `/api/media/...` and returns 404 for a key outside `menu/`.
- [ ] `/admin` redirects to the login screen while signed out.
- [ ] Owner login works, the dashboard renders, and a price change appears on `/menu`.
- [ ] `auth.login_success` appears in the activity list.

## 6. After deploying

- [ ] Run `npm run test:e2e` against the deployed origin if the suite is configured to allow it, or
      re-run the checklist in §5 by hand. Do not assume the local run covers the remote bindings.
- [ ] Confirm the audit list shows the smoke-test changes, then decide whether they should stay.
      They are real rows in a real journal.
- [ ] Record the deploy time and the migration list. A Time Travel restore needs a timestamp.

## 7. Rollback

1. `npx wrangler deployments list` — find the previous version, `npx wrangler rollback`.
2. A code rollback does **not** undo a migration. D1 has no down-migrations here; restoring data
   means a Time Travel restore or an export, which is a decision, not a command.
3. R2 objects deleted by an image removal are not recoverable from D1. This is why a removal writes
   the database change first and the deletion second: a failed commit keeps both.