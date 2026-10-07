import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroVideo } from "../../src/components/hero-video";
import { BUNDLED_HERO_MEDIA, resolveHeroMedia } from "../../src/lib/hero-media";
import {
  heroToggleLabel,
  shouldAttachVideo,
  shouldPlayVideo,
  shouldShowToggle,
} from "../../src/lib/hero-video";

/**
 * The hero video's decision rules, in one place.
 *
 * The component holds no judgement of its own — every branch it takes comes from these
 * functions — so the truth tables below are where reduced motion, Save-Data, hidden
 * tabs, offscreen pauses and failures are actually pinned down. What the DOM *does*
 * with the decisions is covered by `tests/e2e/hero-video.spec.ts`, plus the server
 * markup check at the end of this file, which proves the page ships no video bytes.
 */
describe("hero video attach policy", () => {
  it("attaches the source when nothing asks for restraint", () => {
    expect(shouldAttachVideo({ reducedMotion: false, saveData: false })).toBe(true);
  });

  it("never attaches for a visitor who reduced motion", () => {
    expect(shouldAttachVideo({ reducedMotion: true, saveData: false })).toBe(false);
  });

  it("never attaches on Save-Data — not even to pause it later", () => {
    expect(shouldAttachVideo({ reducedMotion: false, saveData: true })).toBe(false);
    expect(shouldAttachVideo({ reducedMotion: true, saveData: true })).toBe(false);
  });
});

describe("hero video playback policy", () => {
  const playing = {
    attached: true,
    failed: false,
    userPaused: false,
    documentHidden: false,
    inViewport: true,
  };

  it("plays when attached, visible, unpaused, and healthy", () => {
    expect(shouldPlayVideo(playing)).toBe(true);
  });

  it("does not play anything that was never attached", () => {
    expect(shouldPlayVideo({ ...playing, attached: false })).toBe(false);
  });

  it("stops after a failure, even if every other signal is favourable", () => {
    expect(shouldPlayVideo({ ...playing, failed: true })).toBe(false);
  });

  it("honours the visitor's own pause above everything else", () => {
    expect(shouldPlayVideo({ ...playing, userPaused: true })).toBe(false);
  });

  it("pauses while the tab is hidden", () => {
    expect(shouldPlayVideo({ ...playing, documentHidden: true })).toBe(false);
  });

  it("pauses once the hero scrolls out of view", () => {
    expect(shouldPlayVideo({ ...playing, inViewport: false })).toBe(false);
  });

  it("resumes when the hero comes back, because the visitor never asked to stop", () => {
    expect(shouldPlayVideo({ ...playing, inViewport: false })).toBe(false);
    expect(shouldPlayVideo({ ...playing, inViewport: true })).toBe(true);
  });
});

describe("hero video pause control", () => {
  it("exists only when there is video to control", () => {
    expect(shouldShowToggle({ attached: true, failed: false })).toBe(true);
    expect(shouldShowToggle({ attached: false, failed: false })).toBe(false);
    expect(shouldShowToggle({ attached: true, failed: true })).toBe(false);
  });

  it("stays available when autoplay is refused, so playback can start by hand", () => {
    expect(shouldShowToggle({ attached: true, failed: false })).toBe(true);
  });

  it("names the action in French for each state", () => {
    expect(heroToggleLabel(true)).toBe("Mettre la vidéo en pause");
    expect(heroToggleLabel(false)).toBe("Reprendre la vidéo");
  });
});

describe("hero media configuration", () => {
  it("falls back to the committed files when the environment says nothing", () => {
    expect(resolveHeroMedia({})).toEqual(BUNDLED_HERO_MEDIA);
    expect(resolveHeroMedia({ HERO_VIDEO_DESKTOP_URL: "   " })).toEqual(BUNDLED_HERO_MEDIA);
  });

  it("lets each file be redirected individually", () => {
    const resolved = resolveHeroMedia({
      HERO_VIDEO_DESKTOP_URL: " https://cdn.example.com/hero-1080.mp4 ",
    });

    expect(resolved.desktopSrc).toBe("https://cdn.example.com/hero-1080.mp4");
    expect(resolved.mobileSrc).toBe(BUNDLED_HERO_MEDIA.mobileSrc);
    expect(resolved.posterSrc).toBe(BUNDLED_HERO_MEDIA.posterSrc);
  });

  it("commits the three files the policy refers to", () => {
    expect(BUNDLED_HERO_MEDIA).toEqual({
      desktopSrc: "/media/hero-aquarium-1080.mp4",
      mobileSrc: "/media/hero-aquarium-480.mp4",
      posterSrc: "/media/hero-aquarium-poster.webp",
    });
  });
});

/**
 * The server-rendered markup.
 *
 * This is the guarantee the poster-only modes rest on: whatever the browser is told
 * at first paint, no video `src` is in it, so no policy that runs later can be
 * defeated by bytes that were already requested. The pause control is server-hidden
 * too — until hydration attaches a source, there is nothing for it to control.
 */
describe("hero video server markup", () => {
  const html = renderToStaticMarkup(
    <HeroVideo
      desktopSrc={BUNDLED_HERO_MEDIA.desktopSrc}
      mobileSrc={BUNDLED_HERO_MEDIA.mobileSrc}
      posterSrc={BUNDLED_HERO_MEDIA.posterSrc}
    />,
  );

  it("ships the poster and no video source", () => {
    expect(html).toContain('poster="/media/hero-aquarium-poster.webp"');
    expect(html).not.toContain("src=");
    expect(html).not.toContain("<source");
  });

  it("is in the poster state with no pause control until the client decides otherwise", () => {
    expect(html).toContain('data-state="poster"');
    expect(html).not.toContain('data-testid="hero-video-toggle"');
  });

  it("keeps the decorative backdrop out of the accessibility tree", () => {
    expect(html).toContain('aria-hidden="true"');
  });
});
