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
| `OWNER_EMAIL`, `OWNER_NAME` | `npm run db:provision:owner` | the account's login email and the name shown in the dashboard; the email cannot be retyped later, only edited in D1 |
| `OWNER_PASSWORD` | local seed and Playwright suite only | not an application secret; the remote provisioner never reads it - that password is typed twice at a masked prompt, and only its hash reaches anything |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | CI deploy only | least-privilege token, never in the repository |

If `BETTER_AUTH_SECRET` is absent the build succeeds and every login fails at runtime. Check it
explicitly rather than discovering it on the first request.

## 2. Local verification, in order

```bash
npm run cf-typegen
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run build:cf
```

All seven must pass, in this order. `cf-typegen` is first because it rewrites the gitignored
`cloudflare-env.d.ts` from `wrangler.jsonc`, and `typecheck` and `build` read it: after a change to
the Wrangler config, running it last would mean typechecking yesterday's bindings. `test:e2e` builds
the app and runs it under `wrangler` against local D1 and a local R2 emulator, so it is the gate
that proves the Worker runtime works and not only Node.

## 3. Database

Migrations create the schema. Content and the owner account are created afterwards by two
dedicated scripts, both local-first:

- `scripts/seed-local.ts` refuses to run against anything but a database under `.wrangler/state`,
  and refuses to run under `NODE_ENV=production`. That guard is deliberate and pinned by
  `tests/unit/seed-guard.test.ts`.
- No migration inserts a dish, a category, the site settings or the owner account. The two
  `INSERT`s in `drizzle/` are the column rewrites of the Phase 2 table rebuild.

A freshly migrated production database is therefore an empty schema until the two remote scripts
below have run. Both are dry-run by default — they print the SQL they would execute and stop —
neither has a default environment, and neither runs anything without an explicit `--apply`:

| Script | Writes | If the data already exists |
| --- | --- | --- |
| `npm run db:seed:remote -- --env preview\|production` | 5 categories, 34 dishes, the site settings, the gallery manifest — every statement `INSERT … ON CONFLICT DO NOTHING` | Nothing changes: rows the owner has renamed, repriced or hidden survive, and rows the owner added are never touched, because there is no `UPDATE` and no `DELETE` in the file at all |
| `npm run db:provision:owner -- --env preview\|production` | One owner account, password hashed with Better Auth's `hashPassword` | Refuses before writing anything if any `user` row exists, and lists the addresses it found; the SQL has no conflict clause either, so a row appearing in between makes the import fail rather than create a second account |

Read the printed SQL before adding `--apply`. The two scripts leave different things behind,
deliberately:

- `db:seed:remote` writes its file under the gitignored `.wrangler/` (`remote-content.sql`) and
  leaves it there: the content is not secret, and keeping the exact bytes an apply ran is useful
  for a manual re-run.
- `db:provision:owner` writes to a uniquely named directory under the OS temporary directory
  (outside the project, outside the sync) with the most restrictive permissions the platform
  supports, and deletes it when the run ends - including when it fails. The repository lives in a
  synced folder, so a credential hash must not land where a sync or a backup can pick it up. The
  dry run prints a redacted copy (placeholder instead of hash); the real SQL is never printed.

The owner password is read from a masked interactive prompt, typed twice, at `--apply` time -
never from an argument, a file, or an environment variable such as `OWNER_PASSWORD`, which the
provisioning script deliberately ignores. `OWNER_EMAIL` and optionally `OWNER_NAME` come from the
environment or `.dev.vars`; only the password's `hashPassword` output reaches the file and the
database.

Local preparation, which is the same schema and the same data:

```bash
npm run db:migrate:local
npm run db:seed:local
```

Remote schema — read the output before applying it:

```bash
npx wrangler d1 migrations list resta-pescado-db --remote
npx wrangler d1 migrations apply resta-pescado-db --remote

# preview schema, for `npm run dev:preview` after its local migration
npx wrangler d1 migrations list resta-pescado-preview-db --env preview --remote
npx wrangler d1 migrations apply resta-pescado-preview-db --env preview --remote
```

`npm run db:migrate:preview` is the **local** preview migration. It exists so `npm run dev:preview`
has a migrated local database; it always runs with `--local` and never touches the remote preview
database. The remote preview schema is created only by the explicit `--remote` commands above.
Leave the script as it is: a local-looking command that silently migrates a remote database is
exactly the mistake this checklist exists to prevent.

Then, per environment, content and the account:

```bash
npm run db:seed:remote -- --env preview          # prints the SQL, executes nothing
npm run db:seed:remote -- --env preview --apply
npm run db:provision:owner -- --env preview      # prints the redacted SQL, executes nothing
npm run db:provision:owner -- --env preview --apply   # prompts for the password twice, then applies
```

The re-seed is insert-only for owner decisions: `bundled_gallery_images` alt text, captions and
visibility are never overwritten, because those are choices made in the dashboard.

## 4. Before deploying

- [ ] `BETTER_AUTH_SECRET` is set as a Worker secret, not in `wrangler.toml`.
- [ ] `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` are the final origin. A wrong origin here
      fails sign-in with an origin error that looks like a credentials problem.
- [ ] The owner account exists, with the menu and the settings: `db:seed:remote` and
      `db:provision:owner` have been run with `--apply` for this environment, as in §3.
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
- [ ] A dish photograph loads through `/api/media/...` and returns 404 for a key outside `menu/`
      and `gallery/`.
- [ ] A bundled photograph the owner has hidden returns 404 signed out and loads signed in as the
      owner: the gallery authorizes per request, and visibility is the owner's decision.
- [ ] `/robots.txt` matches the environment — `Disallow: /` on preview, crawlable on production —
      and the `<meta name="robots">` tag agrees with it.
- [ ] `/admin` redirects to the login screen while signed out.
- [ ] Owner login works, the dashboard renders, and a price change appears on `/menu`.
- [ ] `auth.login_success` appears in the activity list.

## 6. After deploying

- [ ] Run the read-only smoke test against the real origin:
      `npm run smoke:preview -- --url <origin>` — it automates the §5 checks that can be automated
      (routes, confirmed facts, approved menu, preview `noindex`, signed-out admin, image decoding,
      390 px overflow, console and network errors) and stops with a distinct exit code (2) if the
      origin sits behind Cloudflare Access. See `docs/MANUAL_ACCEPTANCE_CHECKLIST.md` for the manual
      steps that still need a human (owner login, a price change appearing without redeployment, and
      so on).
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