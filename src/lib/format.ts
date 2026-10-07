/**
 * Presentation helpers with no JSX, kept in a plain module so both the components
 * and the unit suites can import them.
 */

/** Formats a whole-dinar price for display, e.g. `950 DA`. */
export function formatPrice(priceDa: number): string {
  return `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(priceDa)} DA`;
}

/** Renders an image key as the proxy URL served by the Worker. */
export function mediaUrl(imageKey: string): string {
  return `/api/media/${imageKey.split("/").map(encodeURIComponent).join("/")}`;
}
