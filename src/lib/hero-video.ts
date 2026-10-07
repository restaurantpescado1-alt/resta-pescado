/**
 * The playback policy behind the homepage hero video, kept as pure functions over
 * injected signals so the rules are unit-testable without a DOM.
 *
 * The rules exist to protect three kinds of visitor:
 *
 * - Someone who asked the system to reduce motion. For them the hero is a photograph,
 *   and the video must not even be downloaded, not merely paused after the fact.
 * - Someone on a metered connection (Save-Data). Same treatment: the 205 KiB poster is
 *   the intended experience, the megabytes are not.
 * - Everyone else, from whom autoplay must stay polite: the video may start on its own
 *   only while muted, visible, and unpaused by choice — and it must yield the moment
 *   the hero leaves the viewport or the tab is hidden.
 *
 * The component (`src/components/hero-video.tsx`) owns the wiring; these functions own
 * the decisions.
 */

/** Signals available before any video is attached. */
export interface HeroAttachSignals {
  readonly reducedMotion: boolean;
  readonly saveData: boolean;
}

/**
 * Whether the `src` may be attached at all.
 *
 * Both signals are one-way doors on purpose: they are read once when the hero mounts,
 * so a visitor who enables Save-Data mid-session keeps the poster for the page load
 * they are already paying for.
 */
export function shouldAttachVideo(signals: HeroAttachSignals): boolean {
  return !signals.reducedMotion && !signals.saveData;
}

/** Signals describing whether playback is currently wanted. */
export interface HeroPlaybackSignals {
  /** A source was attached; without one there is nothing to play. */
  readonly attached: boolean;
  /** The media failed to load or decode. Failure is final for this page load. */
  readonly failed: boolean;
  /** The visitor pressed the pause control. Their choice outranks everything below. */
  readonly userPaused: boolean;
  /** The document is hidden (another tab, backgrounded app). */
  readonly documentHidden: boolean;
  /** The hero is (partly) on screen. */
  readonly inViewport: boolean;
}

/** Whether the video should be playing right now. */
export function shouldPlayVideo(signals: HeroPlaybackSignals): boolean {
  return (
    signals.attached &&
    !signals.failed &&
    !signals.userPaused &&
    !signals.documentHidden &&
    signals.inViewport
  );
}

/**
 * Whether the pause/resume control is shown.
 *
 * Hidden in poster-only modes (nothing to control) and after a failure (nothing left
 * to resume). Deliberately *not* gated on `userPaused` or visibility: a visitor whose
 * autoplay was blocked by the browser still needs the control to start playback
 * themselves.
 */
export function shouldShowToggle(signals: {
  readonly attached: boolean;
  readonly failed: boolean;
}): boolean {
  return signals.attached && !signals.failed;
}

/** The control's French label for the current state. */
export function heroToggleLabel(playing: boolean): string {
  return playing ? "Mettre la vidéo en pause" : "Reprendre la vidéo";
}
