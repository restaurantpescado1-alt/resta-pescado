"use client";

import { useEffect, useRef, useState } from "react";

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
 *   only. The source is chosen in a lazy initializer (so attaching is not an async
 *   afterthought that an accessibility mode could race), and it never appears in a
 *   worker render, so a visitor in a poster-only mode never downloads a single video
 *   byte — not "downloads and pauses", never starts.
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
   * `null` when a poster-only mode applies or during any server render — SSR ships no
   * `src` at all. The lazy initializer runs on the client once, so reduced motion and
   * Save-Data are read for this page load and keep the hero on its poster for good,
   * with no control to show. Below `md` the smaller encode is picked; a later resize
   * does not re-pick the file, because both encodes are valid H.264 and re-downloading
   * mid-session would cost more than the few bytes the wrong choice wastes.
   */
  const [src] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const saveData = connection?.saveData === true;

    if (!shouldAttachVideo({ reducedMotion, saveData })) {
      return null;
    }

    return window.matchMedia("(max-width: 767px)").matches ? mobileSrc : desktopSrc;
  });

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
          className="h-full w-full object-cover"
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
          onClick={() => setUserPaused((paused) => !paused)}
          className="absolute bottom-4 right-4 z-20 rounded-full border border-on-ocean/50 bg-ocean/90 px-4 py-2 text-xs font-semibold text-on-ocean transition-colors hover:bg-ocean"
        >
          {heroToggleLabel(playing)}
        </button>
      ) : null}
    </>
  );
}