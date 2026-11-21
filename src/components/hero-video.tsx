"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  heroToggleLabel,
  shouldAttachVideo,
  shouldPlayVideo,
  shouldShowToggle,
} from "@/lib/hero-video";

/**
 * The homepage hero's background video.
 *
 * Three properties are load-bearing, and each one is tested rather than assumed:
 *
 * - **The server-rendered HTML carries no `src`.** The element ships with its poster
 *   only. The source is picked in an effect after hydration (reading `window` in the
 *   first render would mismatch the server's markup), and it is never picked at all in
 *   a poster-only mode, so that visitor never downloads a single video byte — not
 *   "downloads and pauses", never starts.
 * - **`muted` is set as a property, not a JSX attribute.** React has historically not
 *   rendered the `muted` attribute during server rendering, and the video must be muted
 *   before any `play()` attempt (both for the autoplay policy and because the clip has
 *   no audio track anyway). Assigning the property right before playback is the part
 *   that actually runs; the JSX prop is kept off the element to avoid a hydration
 *   mismatch over an attribute the server does not emit.
 * - **Failure is final and quiet.** An errored video degrades to the same poster the
 *   poster-only modes show, the pause control disappears (there is nothing to pause),
 *   and nothing is retried — the same posture `SafeImage` takes for pictures.
 *
 * The decision rules live in `src/lib/hero-video.ts` and are unit-tested there; this
 * file is the wiring to the DOM.
 */
type HeroVideoState = "poster" | "paused" | "playing" | "failed";

/** The source is decided once per page load; there is nothing to subscribe to. */
const NOOP_SUBSCRIBE = () => () => {};

export function HeroVideo({
  desktopSrc,
  mobileSrc,
  posterSrc,
}: {
  desktopSrc: string;
  mobileSrc: string;
  posterSrc: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /**
   * `useSyncExternalStore` is the one hook built for a browser-only value that must not
   * change the markup React compares during hydration. The server snapshot is always
   * `null`, so SSR and the client's first render are identical (no `src`, poster state,
   * no toggle). React then reads the client snapshot after hydration: the policy is
   * applied once and cached in a ref, so a later resize never re-picks the file.
   *
   * Reduced motion and Save-Data still keep the hero on its poster for good, with no
   * control to show. Below `md` the smaller encode is picked; both encodes are valid
   * H.264, so re-downloading mid-session would cost more than the few bytes the wrong
   * choice wastes.
   */
  const srcCache = useRef<string | null | undefined>(undefined);
  const getClientSnapshot = useCallback(() => {
    if (srcCache.current !== undefined) {
      return srcCache.current;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const saveData = connection?.saveData === true;

    srcCache.current = shouldAttachVideo({ reducedMotion, saveData })
      ? window.matchMedia("(max-width: 767px)").matches
        ? mobileSrc
        : desktopSrc
      : null;

    return srcCache.current;
  }, [desktopSrc, mobileSrc]);
  const src = useSyncExternalStore(NOOP_SUBSCRIBE, getClientSnapshot, () => null);

  const [failed, setFailed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [inViewport, setInViewport] = useState(true);
  const [playing, setPlaying] = useState(false);

  /*
   * Playback step. Every signal that can veto playback is a dependency, so hiding the
   * tab, scrolling the hero away, or pressing the control each re-runs this effect and
   * the element ends up playing if and only if the policy says so.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (shouldPlayVideo({ attached: src !== null, failed, userPaused, documentHidden, inViewport })) {
      video.muted = true;
      void video.play().catch(() => {
        // Autoplay refused (browser policy) or interrupted. The element simply stays
        // paused with the poster visible and the control available to start it.
      });
    } else {
      video.pause();
    }
  }, [src, failed, userPaused, documentHidden, inViewport]);

  /* Element events: the playing state shown on the control mirrors the element. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setFailed(true);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
    };
  }, []);

  /* Tab visibility: a backgrounded tab keeps playing only in the visitor's memory. */
  useEffect(() => {
    const onChange = () => setDocumentHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  /* Viewport presence, observed on the element itself so scrolling away pauses it. */
  useEffect(() => {
    const video = videoRef.current;
    if (!src || !video || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => setInViewport(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);

  const state: HeroVideoState = failed
    ? "failed"
    : playing
      ? "playing"
      : src === null
        ? "poster"
        : "paused";
  const showToggle = shouldShowToggle({ attached: src !== null, failed });

  return (
    <>
      {/*
        The backdrop: footage plus the scrim that keeps every headline over it at the
        contrast the palette guarantees. Decorative, so it is hidden from assistive
        technology and inert to the pointer.
      */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <video
          ref={videoRef}
          data-testid="hero-video"
          data-state={state}
          className="h-full w-full object-cover object-[50%_40%]"
          poster={posterSrc}
          width={1920}
          height={1080}
          playsInline
          loop
          src={src ?? undefined}
          onError={() => setFailed(true)}
        />
        <div className="hero-scrim absolute inset-0" />
      </div>

      {/*
        WCAG 2.2.2: anything that moves on its own for more than five seconds needs a
        way to stop it. The label changes with the state rather than pairing a fixed
        label with aria-pressed, so what is announced is always the action offered.
      */}
      {showToggle ? (
        <button
          type="button"
          data-testid="hero-video-toggle"
          onClick={() => { const v = videoRef.current; if (v) { v.muted = true; void v.play().catch(()=>{}); } setUserPaused(p => !p); }}
          className="absolute right-3 top-3 z-20 rounded-full border border-on-ocean/50 bg-ocean/90 px-4 py-2 text-xs font-semibold text-on-ocean transition-colors hover:bg-ocean"
        >
          {heroToggleLabel(playing)}
        </button>
      ) : null}
    </>
  );
}