# Security Requirements

- One owner account; public registration disabled.
- Secure HTTP-only SameSite cookies.
- Check session and owner role server-side on every admin operation.
- Parameterized Drizzle queries; positive integer DA prices; foreign keys enabled.
- Rate-limit login, reset, upload, and destructive actions.
- Allow JPEG, PNG, and WebP only; verify MIME, signature, dimensions, size, and file completeness.
- Random R2 keys; never expose write credentials to browsers.
- Upload replacement first, update D1 second, delete old object only after success.
- Image removal: clear the reference and write the audit row atomically first, then delete
  the object. A failed commit keeps both the reference and the object. A failed delete after
  a successful commit leaves an unreferenced object, which is logged rather than repaired:
  restoring the old reference would point a dish the owner just cleared at an object whose
  deletion failed. Bundled fish-guide images are never deleted from R2, because they are not
  in it.
- Audit create, update, delete, reorder, settings, and sensitive login actions.
- Keep secrets out of Git, Notion, screenshots, and chat.
- Use D1 Time Travel plus scheduled JSON exports to R2; test restore before launch.

## Order of checks on an owner write

Every action in `src/app/admin/owner-actions.ts` runs the same four steps, in this order:

```text
1. requireOwner        the session and the role, server-side
2. rate limit          per owner and per action, before the work is validated
3. Zod parse           the whole payload, including the expected version
4. write + audit       one batch, exact row count, then revalidate
```

The order matters in two places. Authorization is first because nothing else should run for a
caller who is not the owner, including the validation that would tell them what a valid payload
looks like. The rate limit is before validation so that a flood of malformed requests is
throttled rather than parsed.

The audit row is written by the same batch as the change, so "the journal says it happened" and
"it happened" cannot come apart. `docs/ARCHITECTURE.md` describes the batch and the exact-count
check.

## Password change, and the recovery gap it sits next to

The form at `/admin/compte` is the only credential-management surface. It calls Better Auth's
`changePassword` with the current password, so possession of an unlocked session is not enough to
take the account over, and with `revokeOtherSessions: true`, so a password change also ends
sessions open elsewhere.

- Rate limit: 5 attempts per 5 minutes. The tightest in the dashboard, because there is no
  fallback if the current password is guessed out from under the owner.
- `signOut` is a server action, and its redirect is hard-coded. A caller-chosen redirect target
  would be an open redirect on an authenticated endpoint.
- **No recovery exists.** Better Auth's signup is disabled and no email provider is configured, so
  a forgotten password cannot be reset from the site or from a message. Recovery means running
  `scripts/seed-local.ts`, or a password reset in the D1 console. This is a launch blocker for a
  site with more than one person holding the credentials, and it is recorded rather than papered
  over: adding a fake "mot de passe oublié" link would be worse than nothing.
- **The session cookie after a change depends on `nextCookies()`.** `revokeOtherSessions` deletes
  the current session and issues a new one; if the new cookie is not carried back to the browser
  the owner is signed out by their own password change. See `docs/ARCHITECTURE.md`.

## Known gaps, stated rather than implied

- **No second factor, one account.** `profiles.role = 'owner'` is the entire access model. The
  account is an email address and a password, and both are known to one person.
- **No CSRF token of our own.** Server actions carry Next.js's own origin and action-id checks and
  the cookie is `SameSite=Lax`, which is what makes this acceptable. Adding a hand-rolled token on
  top would be ceremony, not security.
- **Audit readability is deliberately lossy.** The journal renders entity ids and the fields that
  changed. It does not render the owner's email, and it is not a tamper-evident log — see
  `docs/ARCHITECTURE.md`.
- **People in photographs.** The bundled gallery is confirmed by the owner as the restaurant's
  own photographs; that is provenance, not a release. If a photograph shows an identifiable person,
  a written release is a separate requirement and nothing in this codebase records one.

## Limits of upload validation, stated honestly

The byte-level completeness check in `src/lib/images.ts` (`isCompleteImage`) asks each format
for its terminator: JPEG's `FF D9`, PNG's `IEND`, and WebP's declared RIFF length. That
rejects a truncated or interrupted upload, which every other check would have accepted, because
all of them read only the front of the file.

It is **not** a decode. It cannot open the image, verify the pixel data, or catch damage
inside a file whose length and terminator are intact. A real guarantee needs an image decoder
at upload time, which would mean Sharp in the Worker runtime; that is deliberately out of
scope, because it would put a native module in the request path. The practical consequence is
that `SafeImage` degrades a broken image to its alt text instead of showing the browser's
broken-image glyph.
