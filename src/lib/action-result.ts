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
}
