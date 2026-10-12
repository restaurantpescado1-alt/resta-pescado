"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
 * - Escape closes it and returns focus to the button, so a keyboard user is not left with
 *   focus on a node that has just been removed from the tree. So does navigating.
 * - Tapping outside the button or the panel closes it, which is what a touch visitor
 *   expects from a dropdown.
 *
 * The panel is positioned `absolute` against the sticky header rather than laid out as a
 * flex row inside it. As an in-flow row it sorted ahead of the header's own items (the
 * wordmark, the phone action) and drew an open menu *above* the header bar instead of
 * below it. Taking it out of flow fixes that and lets it overlay the page content instead
 * of pushing the header taller.
 *
 * No focus trap and no auto-moved focus. The panel is a plain list of links directly
 * after the button, so the next Tab reaches the first item, which is what someone
 * opening a menu with the keyboard expects. Trapping focus in a navigation list this
 * short would cost more than it solved.
 *
 * The desktop navigation is a separate, CSS-only list in `site-header.tsx`. This component
 * is `md:hidden`, so the two never render at the same width and there is no duplicated
 * landmark for a screen reader to announce twice.
 */
export function MobileNav({ links }: { links: readonly NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLSpanElement | null>(null);

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
        toggleRef.current?.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    /*
      `contents` makes this wrapper disappear from the header's flex layout so the button
      keeps its place in the row; `md:hidden` still removes the whole control above the
      breakpoint, where the desktop list takes over.
    */
    <span ref={containerRef} className="contents md:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls="primary-mobile-nav"
        onClick={() => setOpen((value) => !value)}
        data-testid="mobile-nav-toggle"
        className="order-1 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-on-ocean transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
          {open ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          ) : (
            <span className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 rounded bg-current" />
              <span className="block h-[2px] w-4 rounded bg-current" />
              <span className="block h-[2px] w-4 rounded bg-current" />
            </span>
          )}
        </span>
        {open ? "Fermer" : "Menu"}
      </button>

      {/*
        The dropdown. Absolutely positioned against the sticky header, so it hangs below
        the bar and overlays the page rather than stretching the header or sorting above
        it. Capped to the viewport height and scrollable, so a long list stays reachable on
        a short screen.
      */}
      <nav
        id="primary-mobile-nav"
        aria-label="Navigation principale"
        hidden={!open}
        data-testid="mobile-nav"
        className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-white/15 bg-ocean pb-[env(safe-area-inset-bottom)] shadow-lg"
      >
        <ul className="mx-auto flex max-w-6xl flex-col px-4 py-3">
          {links.map((link) => {
            const current = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center rounded-md px-3 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
    </span>
  );
}
