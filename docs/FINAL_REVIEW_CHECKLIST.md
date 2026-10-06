# Final Review Checklist

The state of this project at handoff, written so that the next person does not have to discover it.
Everything below has been run or read on the machine that produced it; nothing is assumed.

## Verified

| Check | Result |
| --- | --- |
| `npm run lint` | passes, `eslint .` over `src`, `tests`, `scripts`, config |
| `npm run typecheck` | passes, `tsc --noEmit`, strict |
| `npm run test` | 14 files, 295 tests, all passing |
| `npm run test:e2e` | 101 passed, 2 skipped (both screenshot captures, `CAPTURE_SCREENSHOTS` unset) |
| `npm run build` | passes; every route listed, `admin` and `api/media` among them |
| `npm run build:cf` | passes; OpenNext emits `.open-next/worker.js` |
| `npm run cf-typegen` | passes; `cloudflare-env.d.ts` matches `wrangler.jsonc` including `DEPLOYMENT_MODE` |
| Local migrations | `0000`–`0002` applied with `--local` |
| Local seed | 5 categories, 34 dishes, 15 species references, 7 bundled photographs, 0 uploads |
| Phase 3 migration | creates the version/token columns, `bundled_gallery_images`, captions |
| Remote scripts (dry run) | `db:seed:remote` and `db:provision:owner` print their SQL, execute nothing without `--apply` |

All seven gates ran on this tree, in the order of `docs/DEPLOYMENT_CHECKLIST.md` §2, immediately
before the commit that carries Phase 4. One failure was found and fixed rather than skipped:
`wrangler types` narrows `DEPLOYMENT_MODE` to the literals `wrangler.jsonc` declares, which made
the `"local"` branch of `resolveDeploymentMode` a type error as soon as `cf-typegen` ran — the
branch is real (the unit suite sets it), so the value is now read as a plain string with the same
fail-closed fallback, rather than the branch being deleted to satisfy the compiler. `cf-typegen`
now runs first in §2 for the same reason: `typecheck` and `build` read what it writes.

## Open items, in the order they block launch

### 1. Production provisioning exists, but has never been run against a real database

`npm run db:seed:remote` and `npm run db:provision:owner` now create the menu, the settings, the
gallery manifest and the owner account on any environment, dry-run by default, with no default
environment, and with the owner script refusing to write anything if an account already exists.
Their SQL is tested against real SQLite with the real migrations: idempotent, insert-only, and
non-destructive against owner edits (`tests/unit/remote-init.test.ts`).

What is still open is the first `--apply`: creating remote resources and running remote commands is
deliberately outside what was verified here, so the preview and production databases have not been
seeded by these scripts. Until someone runs §3 of `docs/DEPLOYMENT_CHECKLIST.md` against a real
environment, this blocks launch exactly as the old open item did — the difference is that the
remaining work is a documented command, not a missing feature.

### 2. No password recovery

No email provider is configured, so a forgotten password means editing D1. `docs/OWNER_GUIDE.md`
tells the owner this plainly. Acceptable only if exactly one person holds the credentials and has a
password manager; not acceptable the moment a second person does.

### 3. Consent for identifiable people

The bundled gallery is confirmed by the owner as the restaurant's own photographs. That is
provenance, not a release. If any photograph shows an identifiable person, a written release is a
separate requirement and nothing here records one. Check the seven photographs before launch.

### 4. No independent visual review

The dashboard was written to be usable at 390 px, keyboard-operable and French throughout, and that
was verified by reading it and by unit tests. Nobody has looked at it in a browser. The claims in
`docs/OWNER_GUIDE.md` about button labels and flows are taken from the components, not from
watching someone use them.

Screenshots of the public pages exist under `docs/screenshots/phase-2/`, and every owner route at
both widths under `docs/screenshots/phase-3/admin/` — login included, captured signed out. They
are written by `tests/e2e/screenshots.spec.ts`, which is skipped unless `CAPTURE_SCREENSHOTS` is
set, so a normal `npm run test:e2e` never rewrites them. Having the files is not the same as having
had the review: they have not been looked at by a person yet.

## Known weaknesses that are documented rather than fixed

Each is written up where it belongs, and repeated here so it is not a surprise later:

- **Reorder is not atomic against a malformed payload.** The exact-count check runs after the batch
  commits. Clients always send the complete collection and the server refuses a list that does not
  match what it was shown, so this is only reachable by a request that is already wrong.
  `docs/ARCHITECTURE.md`.
- **Three dish controls skip the version guard** — photograph replace, photograph remove, featured
  toggle. Each writes one field. Isolated in one component so the guard is three call sites.
  `docs/ARCHITECTURE.md`.
- **`version: 0` on a bundled photograph is a sentinel**, not a version. The admin page creates the
  rows before reading so the editor never shows it.
- **Upload completeness checking is a terminator check, not a decode.** A file whose length and
  terminator are intact but whose pixel data is damaged is accepted. `docs/SECURITY.md`.
- **The audit log is append-only by convention.** Nothing in the database prevents an update or a
  delete by anything else holding D1 credentials.
- **Both seeds are insert-only for owner decisions.** Alt text, captions and visibility of bundled
  photographs survive a re-seed; that is deliberate, and it also means a re-seed will not repair a
  wrong editorial decision. `db:seed:remote` goes further than the local seed: it contains no
  `UPDATE` and no `DELETE` at all, so nothing it did not insert can be changed by running it.

## What was deliberately not built

No online ordering, no payment, no reservations, no live availability, no WhatsApp ordering, no
loyalty or promotions, no POS or table ordering, no second administrator, no AI generation. The
site does not claim to offer any of them, and no field in the dashboard implies otherwise.

The delivery information on the site is the owner's own statement, arranged by phone. No fee, zone
list or minimum was invented. The address is nullable for the same reason: it is not confirmed.