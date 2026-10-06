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
 * Per-action limits for every admin write.
 *
 * Login and sign-up are already covered by Better Auth's own `rateLimit` config
 * in `@/auth`. These exist for the operations Better Auth does not see.
 *
 * Two tiers, and the difference is about damage rather than frequency:
 *
 * - **Editing** text, prices, visibility and order gets a generous budget. These are
 *   single-row or whole-list writes the owner may do many times in an afternoon, and being
 *   locked out mid-tidy is worse than the abuse they prevent.
 * - **Destruction** — deleting a category, removing a photograph, changing the password —
 *   gets a tight one. These are the operations with no undo, so a stuck retry loop must not
 *   be able to work through them quickly.
 *
 * Uploads are tighter than edits because each one writes an object to R2, which costs
 * storage whether or not the database change is kept.
 */
export const ADMIN_RATE_LIMITS: Record<string, RateLimitRule> = {
  updateDishPrice: { action: "menu_item.update_price", limit: 60, windowSeconds: 60 },
  replaceDishImage: { action: "menu_item.replace_image", limit: 10, windowSeconds: 60 },
  /*
   * Removal is destructive and there is no undo in the dashboard, so it gets a tighter
   * budget than an upload. Ten a minute is enough to tidy a whole menu and small enough
   * that a stuck retry loop cannot work through the bucket quickly.
   */
  removeDishImage: { action: "menu_item.remove_image", limit: 10, windowSeconds: 60 },
  setDishFeatured: { action: "menu_item.set_featured", limit: 60, windowSeconds: 60 },

  /* Phase 3 content editing. */
  createDish: { action: "menu_item.create", limit: 30, windowSeconds: 60 },
  updateDishDetails: { action: "menu_item.update_details", limit: 60, windowSeconds: 60 },
  setDishVisibility: { action: "menu_item.set_visible", limit: 60, windowSeconds: 60 },
  reorderDishes: { action: "menu_item.reorder", limit: 30, windowSeconds: 60 },
  createCategory: { action: "menu_category.create", limit: 30, windowSeconds: 60 },
  renameCategory: { action: "menu_category.rename", limit: 60, windowSeconds: 60 },
  setCategoryVisibility: { action: "menu_category.set_visible", limit: 60, windowSeconds: 60 },
  reorderCategories: { action: "menu_category.reorder", limit: 30, windowSeconds: 60 },
  updateSettings: { action: "site_settings.update", limit: 20, windowSeconds: 60 },

  /* Phase 3 gallery. */
  updateBundledImage: { action: "gallery.bundled_update", limit: 60, windowSeconds: 60 },
  reorderBundledGallery: { action: "gallery.bundled_reorder", limit: 30, windowSeconds: 60 },
  updateGalleryImage: { action: "gallery.uploaded_update", limit: 60, windowSeconds: 60 },
  uploadGalleryImage: { action: "gallery.upload", limit: 10, windowSeconds: 60 },
  reorderGallery: { action: "gallery.reorder", limit: 30, windowSeconds: 60 },

  /* Destructive: no undo in the dashboard. */
  deleteCategory: { action: "menu_category.delete", limit: 10, windowSeconds: 60 },
  deleteGalleryImage: { action: "gallery.uploaded_delete", limit: 10, windowSeconds: 60 },

  /*
   * Deliberately tight. A password change is the one write that can lock the owner out of
   * their own dashboard, and Better Auth already rate-limits authentication endpoints, so
   * this is the belt to that braces: a handful of attempts a minute, and no path that lets a
   * script try thousands of current passwords.
   */
  changePassword: { action: "auth.change_password", limit: 5, windowSeconds: 300 },
};
