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
}
