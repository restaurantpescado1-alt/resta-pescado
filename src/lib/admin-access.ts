import type { RateLimitRule } from "@/db/repositories/admin";

/**
 * Admin authorization primitives that carry no side effects.
 *
 * This module is deliberately free of any import that touches Better Auth, D1, or
 * `getCloudflareContext()`. The server-action module `@/lib/authz` needs those,
 * but keeping the error type and the rate-limit rules here means the unit suites
 * can assert on them without a Worker context.
 */

/**
 * Thrown by `requireOwnerOrThrow` inside a server action.
 *
 * Distinct from a redirect on purpose: a page can send the visitor to the login
 * screen, an action has to fail rather than navigate.
 */
export class NotOwnerError extends Error {
  readonly code = "NOT_OWNER";

  constructor() {
    super("Accès réservé au propriétaire.");
    this.name = "NotOwnerError";
  }
}

/**
 * Per-action limits for the two admin writes.
 *
 * Login and sign-up are already covered by Better Auth's own `rateLimit` config
 * in `@/auth`. These exist for the operations Better Auth does not see.
 */
export const ADMIN_RATE_LIMITS: Record<string, RateLimitRule> = {
  updateDishPrice: { action: "menu_item.update_price", limit: 60, windowSeconds: 60 },
  replaceDishImage: { action: "menu_item.replace_image", limit: 10, windowSeconds: 60 },
};
