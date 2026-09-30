# Security Requirements

- One owner account; public registration disabled.
- Secure HTTP-only SameSite cookies.
- Check session and owner role server-side on every admin operation.
- Parameterized Drizzle queries; positive integer DA prices; foreign keys enabled.
- Rate-limit login, reset, upload, and destructive actions.
- Allow JPEG, PNG, and WebP only; verify MIME, signature, dimensions, and size.
- Random R2 keys; never expose write credentials to browsers.
- Upload replacement first, update D1 second, delete old object only after success.
- Audit create, update, delete, reorder, settings, and sensitive login actions.
- Keep secrets out of Git, Notion, screenshots, and chat.
- Use D1 Time Travel plus scheduled JSON exports to R2; test restore before launch.
