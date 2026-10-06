/**
 * Result shape returned by both admin server actions.
 *
 * Declared separately from `actions.ts` because that module is `"use server"`,
 * and a `"use server"` module may only export async functions. Keeping the type
 * here lets the client component import it as a type.
 */
export interface ActionResult {
  ok: boolean;
  /** French, user-facing. Never contains stack traces or internal identifiers. */
  message: string;
  priceDa?: number;
  imageKey?: string | null;
  isFeatured?: boolean;
  /**
   * What a dish now shows instead of its photograph: the slug of its species
   * illustration, or `text-only` when it has none. Lets the dashboard say what happened
   * rather than leaving the owner to guess whether the fish drawing is now the photo.
   */
  fallback?: string;

  /* Phase 3: the dashboard needs to redraw itself from the answer, not guess. */

  /**
   * True when the write was rejected because the row had already changed.
   *
   * Distinct from `ok: false` because the remedy differs: a stale edit needs a reload before
   * the owner can try again, whereas an invalid field needs a correction. The UI reloads on
   * this one and keeps the form open on the others.
   */
  stale?: boolean;
  /** Id of a row the owner just created, so the list can expand to it. */
  id?: string;
  isVisible?: boolean;
}
