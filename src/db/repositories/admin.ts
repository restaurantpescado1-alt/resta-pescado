import { eq, sql } from "drizzle-orm";

import type { Database } from "..";
import { profiles, rateLimitCounters, type ProfileRow } from "../schema";

/**
 * Loads the profile for an authenticated user and confirms the owner role.
 *
 * This is the single authorization check for the whole admin surface. Every admin
 * page and every server action calls it, and the role comparison happens here so
 * no caller can forget it.
 */
export async function findOwnerProfile(db: Database, userId: string): Promise<ProfileRow | null> {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  const profile = rows[0];
  if (!profile || profile.role !== "owner") {
    return null;
  }
  return profile;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Unix seconds at which the current window ends. */
  retryAfterSeconds: number;
}

export interface RateLimitRule {
  /** Stable identifier for the limit, e.g. `menu_item.replace_image`. */
  action: string;
  /** Calls permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Fixed-window limiter backed by D1.
 *
 * A fixed window is deliberate: it is a handful of upserts, it needs no extra
 * Cloudflare product, and the worst case at a window boundary is `limit` extra
 * calls. That is well inside what Phase 1 needs.
 *
 * The rollover is handled by a single `INSERT ... ON CONFLICT DO UPDATE` with a
 * `CASE` expression, so counting a call and starting a new window are one atomic
 * statement. An earlier version put the window check in `setWhere` instead:
 *
 *   ```sql
 *   ON CONFLICT (key) DO UPDATE SET count = count + 1 WHERE window_start = :new
 *   ```
 *
 * That is wrong on rollover. When the stored window had expired the `WHERE` failed,
 * so the conflict branch matched nothing, `RETURNING` produced no row, and the
 * stored count stayed at whatever the previous window ended on. With the default
 * limit that permanently locked the owner out: the first call of every new window
 * was rejected and the counter never came back down.
 *
 * Rather than guess a count when `RETURNING` is empty, this throws. A missing row
 * means the statement did not do what it was asked to, and silently substituting a
 * count would turn a bug into a limit that is either too tight or too loose.
 */
export async function consumeRateLimit(
  db: Database,
  identity: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitDecision> {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const windowStart = nowSeconds - (nowSeconds % rule.windowSeconds);
  const windowEnd = windowStart + rule.windowSeconds;
  const key = `${rule.action}:${identity}`;

  const rows = await db
    .insert(rateLimitCounters)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitCounters.key,
      set: {
        // Same window: count this call. New window: start over at 1 for the
        // call being made now.
        count: sql`CASE WHEN ${rateLimitCounters.windowStart} = ${windowStart} THEN ${rateLimitCounters.count} + 1 ELSE 1 END`,
        windowStart: sql`CASE WHEN ${rateLimitCounters.windowStart} = ${windowStart} THEN ${rateLimitCounters.windowStart} ELSE ${windowStart} END`,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error(`Rate limit counter for "${key}" was not returned by the upsert`);
  }

  return {
    allowed: row.count <= rule.limit,
    remaining: Math.max(0, rule.limit - row.count),
    retryAfterSeconds: Math.max(1, windowEnd - nowSeconds),
  };
}

/** Clears expired windows. Called opportunistically, never required for correctness. */
export async function pruneRateLimitCounters(db: Database, now: Date = new Date()): Promise<void> {
  const cutoff = Math.floor(now.getTime() / 1000) - 86_400;
  await db.delete(rateLimitCounters).where(sql`${rateLimitCounters.windowStart} < ${cutoff}`);
}
