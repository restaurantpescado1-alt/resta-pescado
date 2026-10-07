"use client";

import { useState } from "react";

/**
 * An image that degrades to text when it cannot be displayed.
 *
 * Every image on the public site can fail for reasons the site does not control: a stored
 * asset deleted by hand, a bad `Content-Type`, a truncated file that slipped past upload
 * validation, or a bundled asset that never made it into the build. When that happens the
 * browser paints its own broken-image glyph, which on a restaurant menu looks like the
 * restaurant is broken.
 *
 * So failure is caught here and replaced with something deliberate.
 *
 * Two details matter more than they look:
 *
 * - **No retry loop.** The failed URL is remembered rather than a boolean, and once the
 *   current `src` is the one that failed this renders the fallback instead of the `img`.
 *   There is no element left to fire another error, so nothing can spin. Remembering the
 *   URL rather than a boolean also means a genuinely new image is still displayed: change
 *   the `src` and the guard no longer matches.
 * - **The alt text is not thrown away.** It becomes the visible fallback text, so the
 *   description still reaches the visitor instead of vanishing with the picture.
 */
export function SafeImage({
  src,
  alt,
  width,
  height,
  className,
  loading = "lazy",
  decoding = "async",
  fallbackClassName = "rounded-lg border border-line bg-warm/60",
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
  fallbackClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <div
        // The picture is gone, so this is now a text box. Marking it as an image region
        // would be a lie, and leaving the img in place would reintroduce the glyph.
        role="img"
        aria-label={alt}
        data-testid="image-fallback"
        style={width && height ? { width, height } : undefined}
        className={`flex items-center justify-center p-2 text-center text-[0.7rem] leading-tight text-ink/70 ${fallbackClassName} ${className ?? ""}`}
      >
        <span>{alt}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      data-testid="safe-image"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}