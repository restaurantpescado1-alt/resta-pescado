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
 * reaches validation, D1, or the media store.
 */
async function loadOwnerProfile(): Promise<ProfileRow | null> {
  return getOwnerProfileFrom(await headers());
}

/**
 * The owner behind an explicit set of request headers, or null.
 *
 * `loadOwnerProfile` reads Next's ambient request headers, which only exists
 * while a page or action is rendering. `/api/media` is a Route Handler handed
 * the `Request` itself and serves anonymous callers, so it resolves the session
 * from those headers instead. Both paths end in the same `profiles` read, which
 * is what keeps "who may do this" in one place.
 */
export async function getOwnerProfileFrom(requestHeaders: Headers): Promise<ProfileRow | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) {
    return null;
  }
  return findOwnerProfile(getDb(), session.user.id);
}

/** The signed-in owner and the email Better Auth actually authenticates them with. */
export interface OwnerSession {
  readonly profile: ProfileRow;
  readonly email: string;
}

/**
 * Page guard that also hands back the account email.
 *
 * The email lives on the Better Auth user row rather than in `profiles`, so reading it here
 * means going back to the session instead of storing a second copy that could drift. Only the
 * account section needs it; every other page uses `requireOwner`.
 */
export async function requireOwnerSession(destination?: string): Promise<OwnerSession> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect(loginUrlFor(destination ?? DEFAULT_OWNER_REDIRECT));
  }
  const profile = await findOwnerProfile(getDb(), session.user.id);
  if (!profile) {
    throw new NotOwnerError();
  }
  return { profile, email: session.user.email };
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
