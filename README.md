# Resta Pescado

Production website, native digital menu, and secure single-owner dashboard for Resta Pescado.

## Approved stack

- Next.js + TypeScript + Tailwind CSS
- Cloudflare Workers + D1, media stored and delivered by ImageKit
- Better Auth
- Drizzle ORM
- Zod

## V1 exclusions

No online ordering, payment, WhatsApp ordering, online reservations, loyalty, promotions, POS, table ordering, live availability, or multiple admins.

## Start here

Read `docs/OPENCODE_PHASE_1.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY.md` before implementation.
`docs/CONTENT_POLICY.md` governs what copy and imagery may claim.

## Local development

Requires Node 22 or newer.

```bash
npm install
npm run test:e2e:install     # Chromium, for the end-to-end suite only
cp .env.example .dev.vars    # then fill in BETTER_AUTH_SECRET and OWNER_PASSWORD
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

`.dev.vars` is gitignored and never committed. `BETTER_AUTH_SECRET` needs at least 32
random characters, and `OWNER_PASSWORD` at least 12, which Better Auth enforces.

The seed creates the single owner, one visible category, and one visible dish with no
photograph (`image_key` stays null — `docs/CONTENT_POLICY.md` ranks "no image" above an
invented one). It is idempotent and safe to re-run: it resets the seeded
dish's price so the end-to-end suite starts from a known state.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server, with the OpenNext Cloudflare bindings. |
| `npm run build` | Production Next.js build. |
| `npm run build:cf` | OpenNext build, producing `.open-next/worker.js`. |
| `npm run preview` | Builds, then runs the Worker in workerd on `E2E_BASE_URL`. |
| `npm run lint` | ESLint, flat config. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Vitest unit and repository suites. |
| `npm run test:e2e` | Playwright, against `preview` with local D1 and a local fake ImageKit server. |
| `npm run db:generate` | Regenerates Drizzle migrations from the schema. |
| `npm run db:migrate:local` | Applies migrations to the local D1 database. |
| `npm run db:seed:local` | Seeds the local owner, category, and dish (no photograph). |
| `npm run cf-typegen` | Regenerates `cloudflare-env.d.ts` from `wrangler.jsonc`. |
| `npm run smoke:preview` | Read-only live-preview smoke test against a *deployed* Cloudflare preview. See "Preview verification" below. |

## End-to-end notes

`npm run test:e2e` starts the server itself: it seeds, builds, and previews before running
any test. Three projects run in order:

- `setup` signs in once and saves the session to `playwright/.auth/owner.json`.
- `anonymous` runs the access-control specs from an empty storage state.
- `chromium` runs everything else against the saved session.

The single sign-in is deliberate. Better Auth rate limits `/sign-in/email` to five requests
a minute, and the suite has more authenticated tests than that, so signing in per test
spent the whole budget and the surplus requests came back as `429`, which the login form
reports as "wrong credentials".

OpenNext is not fully supported on Windows. `preview` and `build:cf` work, but a stale
`workerd` process holding port 8787 will serve an old build, and can lock `.open-next`
with `EPERM`. Kill it before rebuilding.

## Preview verification

Once a Cloudflare preview is deployed (D1, the ImageKit variables, and the workers.dev
hostname exist and the databases are seeded), check it without touching it:

```bash
npm run smoke:preview -- --url https://resta-pescado-preview.<account>.workers.dev
```

The command is read-only: it checks the five public pages, the confirmed facts and
approved menu, preview `noindex`, signed-out admin protection, image decoding, 390px
overflow, and console/network errors. It refuses loopback hosts and production-looking
targets unless `--allow-production` is passed on purpose, and a preview behind Cloudflare
Access is reported as blocked at the edge (exit code 2) rather than broken. It never
stores an Access cookie or Playwright auth state.

The human counterpart — the owner's manual acceptance run and the exact steps to undo its
changes — lives in `docs/MANUAL_ACCEPTANCE_CHECKLIST.md`, and the short owner training
guide in `docs/GUIDE_FORMATION_PROPRIETAIRE.md`. The smoke test, not `test:e2e`, is the
verification used against a *deployed* preview: `test:e2e` builds and boots a local
Worker against local D1 and the local fake ImageKit server.

## Deployment

`npm run deploy` builds and deploys through OpenNext. Phase 1 is not deployed: the D1
binding, the `BETTER_AUTH_SECRET`, and the ImageKit credentials (`IMAGEKIT_URL_ENDPOINT`
as a var, `IMAGEKIT_PRIVATE_KEY` as a secret) have to exist in the target account first. The content
and the owner account are provisioned from this repository with `npm run db:seed:remote` and
`npm run db:provision:owner` - both dry-run by default and explicit about the environment. The
owner script reads its password from a masked prompt, never from an environment variable, and
writes its SQL only to a temporary file outside the project that is deleted when the run ends.
`docs/DEPLOYMENT_CHECKLIST.md` §3 has the exact commands.
