"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals a below-the-fold section once, when it scrolls into view.
 *
 * The base state is visible. JavaScript only *adds* the animation class when the section
 * is about to be seen, so a visitor without JavaScript — or one whose observer never fires
 * — still gets the content. The opposite arrangement, hiding by default and revealing on
 * script, is the version that silently blanks a page when the script does not run.
 *
 * The observer disconnects after the first reveal; a section that fades out again when it
 * leaves the viewport is a distraction, not a flourish. `prefers-reduced-motion` is
 * handled in CSS, where the animation is switched off and the class becomes a no-op.
 */
export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      // Deferred so this is a callback, not a synchronous setState during the effect.
      const id = window.setTimeout(() => setShown(true), 0);
      return () => window.clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const className = shown ? (delay ? `reveal reveal-delay-${delay}` : "reveal") : "";

  return (
    <div ref={ref} className={className} data-reveal>
      {children}
    </div>
  );
}

export default Reveal;
