import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/auth";
import { getDb } from "@/db";
import { findOwnerProfile } from "@/db/repositories/admin";
import type { ProfileRow } from "@/db/schema";
import { DEFAULT_OWNER_REDIRECT, loginUrlFor } from "./redirects";
import { NotOwnerError } from "./admin-access";

export { ADMIN_RATE_LIMITS, NotOwnerError } from "./admin-access";

/**
 * The single authorization gate for the admin surface.
 *
 * Reads the Better Auth session, loads `profiles` for that user, and requires
 * `role === 'owner'`. Every admin page and every server action calls this before
 * touching any other input, so an anonymous or wrongly-roled caller never
 * reaches validation, D1, or R2.
 */
async function loadOwnerProfile(): Promise<ProfileRow | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }
  return findOwnerProfile(getDb(), session.user.id);
}

/**
 * Page guard: redirects to the login screen, preserving where the visitor was
 * headed so a successful sign-in returns them there.
 *
 * `destination` is the path the page was requested at. It is sanitised by
 * `loginUrlFor`, never interpolated raw.
 */
export async function requireOwner(destination?: string): Promise<ProfileRow> {
  const profile = await loadOwnerProfile();
  if (!profile) {
    redirect(loginUrlFor(destination ?? DEFAULT_OWNER_REDIRECT));
  }
  return profile;
}

/** Action guard: throws instead of redirecting, so a write cannot silently continue. */
export async function requireOwnerOrThrow(): Promise<ProfileRow> {
  const profile = await loadOwnerProfile();
  if (!profile) {
    throw new NotOwnerError();
  }
  return profile;
}

/** Non-throwing variant, used by the login page to bounce an owner away from the form. */
export async function getOwnerProfile(): Promise<ProfileRow | null> {
  return loadOwnerProfile();
}
