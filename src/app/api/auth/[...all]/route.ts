import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/auth";

/**
 * Better Auth's catch-all mount point.
 *
 * Two things are deliberate here.
 *
 * `getAuth()` is called per request rather than at module scope: building the
 * auth instance reads the D1 binding, and module scope is evaluated during
 * `next build`, where no request context exists to read a binding from.
 *
 * `toNextJsHandler` returns an object of handlers keyed by HTTP method, so the
 * result is destructured. Exporting it as `export const GET = toNextJsHandler(...)`
 * would hand Next.js an object where it expects a function, and every call fails
 * with "Function.prototype.apply was called on an object".
 */
const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));

export { GET, POST };
