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
      set: { count: sql`${rateLimitCounters.count} + 1` },
      setWhere: sql`${rateLimitCounters.windowStart} = ${windowStart}`,
    })
    .returning();

  const count = rows[0]?.count ?? 1;

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, windowEnd - nowSeconds),
  };
}

/** Clears expired windows. Called opportunistically, never required for correctness. */
export async function pruneRateLimitCounters(db: Database, now: Date = new Date()): Promise<void> {
  const cutoff = Math.floor(now.getTime() / 1000) - 86_400;
  await db.delete(rateLimitCounters).where(sql`${rateLimitCounters.windowStart} < ${cutoff}`);
}
