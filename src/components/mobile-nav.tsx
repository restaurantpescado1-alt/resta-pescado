"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

/**
 * Compact navigation for narrow screens.
 *
 * This replaces a row of links that wrapped onto a second line at 390px. The row was
 * reachable without JavaScript, which was its one virtue, but it pushed the sticky header
 * to two rows tall and ate a slice of a small screen that the visitor needs for the menu.
 *
 * A disclosure is the right trade here, and the details are what make it accessible
 * rather than merely smaller:
 *
 * - `aria-expanded` on the button and `aria-controls` pointing at the panel, so the state
 *   is announced rather than only drawn.
 * - The panel is toggled with the `hidden` attribute, not a class. That removes it from
 *   the accessibility tree and from the tab order when closed, which a visually-hidden
 *   panel would not: a closed menu you can still tab into is the classic bug here.
 * - Escape closes it, and so does navigating, because both are what a person expects.
 * - No focus trap and no auto-moved focus. The panel is a plain list of links directly
 *   after the button, so the next Tab reaches the first item, which is what someone
 *   opening a menu with the keyboard expects. Trapping focus in a navigation list this
 *   short would cost more than it solved.
 *
 * The desktop navigation is a separate, CSS-only list in `site-header.tsx`. This component
 * is `md:hidden`, so the two never render at the same width and there is no duplicated
 * landmark for a screen reader to announce twice.
 */
export function MobileNav({ links }: { links: readonly NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /*
   * Close on navigation. `usePathname` changing means a link was followed, and leaving
   * the panel open across a route change hides the menu on the page the visitor just
   * asked for. Every link in the panel already closes it on click; this catches the links
   * outside the panel, the logo above it in particular.
   *
   * Adjusting state during render rather than in an effect, which is React's documented
   * way to react to a changed input: it is one render instead of two, and it cannot show
   * a stale open panel for a frame. `setOpen` is called on this component, so this is the
   * supported case for a render-time setState.
   */
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (pathname !== renderedPath) {
    setRenderedPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="primary-mobile-nav"
        onClick={() => setOpen((value) => !value)}
        data-testid="mobile-nav-toggle"
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-on-ocean transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-[2px] w-4 rounded bg-current" />
          <span className="block h-[2px] w-4 rounded bg-current" />
          <span className="block h-[2px] w-4 rounded bg-current" />
        </span>
        Menu
      </button>

      <nav
        id="primary-mobile-nav"
        aria-label="Navigation principale"
        hidden={!open}
        data-testid="mobile-nav"
        className="border-t border-white/15 md:hidden"
      >
        <ul className="mx-auto flex max-w-6xl flex-col px-2 py-2">
          {links.map((link) => {
            const current = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    current
                      ? "bg-white/15 text-on-ocean"
                      : "text-on-ocean/90 hover:bg-white/10"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}