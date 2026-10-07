# Homepage hero video

The homepage hero plays a short aquarium clip as its background, behind a deep-ocean
gradient scrim. This record covers where the footage comes from, how the committed files
were produced, and why the video is delivered the way it is.

## Source and licence

| Field | Value |
| --- | --- |
| Title | Serene Aquarium Scene with Vibrant Fish |
| Creator | Teodor Buhl (Pexels profile `@mrgajowy3`) |
| Source page | <https://www.pexels.com/video/serene-aquarium-scene-with-vibrant-fish-37881600/> |
| Direct file | <https://videos.pexels.com/video-files/37881600/16072379_1920_1080_30fps.mp4> |
| Licence | Pexels License — <https://www.pexels.com/license/> (free commercial use, no attribution required) |
| Retrieved | 2026-10-07 |
| Original | 1920×1080, H.264 High, 29.87 fps, 18.88 s, ~13.4 Mbps, no audio track, 31,602,849 bytes |

The original download lives **outside the repository** (a working copy kept next to this
project's media folder) and is never committed. Only the derived web assets below ship.

`docs/CONTENT_POLICY.md` ranks clearly licensed commercial-use stock as priority 4, which
is what this clip is. It is not AI-generated, so no AI label applies. It is decorative: the
video carries no caption and is hidden from assistive technology, and nothing on the page
claims the aquarium is the restaurant, a supplier's tank, or the origin of any fish — the
content policy forbids exactly those claims.

## Produced files

All three are committed under `public/media/` and served as ordinary same-origin static
assets:

| File | Bytes | Format |
| --- | --- | --- |
| `hero-aquarium-1080.mp4` | 3,127,164 (2.98 MiB) | H.264 High, 1920×1080, yuv420p, 1.32 Mbps, 18.88 s, no audio |
| `hero-aquarium-480.mp4` | 1,437,644 (1.37 MiB) | H.264 High, 854×480, yuv420p, 0.61 Mbps, 18.88 s, no audio |
| `hero-aquarium-poster.webp` | 210,004 (205 KiB) | WebP q82, 1920×1080, frame at t=1.5 s |

The 480p file is served to viewports below 768px, the 1080p file above. Both are far under
the 25 MiB per-file static asset limit (see below), and the poster — the only file the
poster-only modes ever request — is 205 KiB.

### Preparation commands

FFmpeg 9.0.2 (installed via `winget install --id Gyan.FFmpeg`), two-pass libx264,
metadata stripped (`-map_metadata -3`), no audio, no upscaling, keyframes every 2 s for
efficient range seeking:

```text
# Desktop (1920×1080, ~1300 kbps target)
ffmpeg -y -i hero-source.mp4 -map_metadata -3 -an -c:v libx264 -preset slow -pix_fmt yuv420p \
  -g 60 -keyint_min 60 -sc_threshold 0 -profile:v high -level 4.0 \
  -b:v 1300k -maxrate 1560k -bufsize 2600k -pass 1 -passlogfile <tmp> -f mp4 NUL
ffmpeg -y -i hero-source.mp4 -map_metadata -3 -an -c:v libx264 -preset slow -pix_fmt yuv420p \
  -g 60 -keyint_min 60 -sc_threshold 0 -profile:v high -level 4.0 \
  -b:v 1300k -maxrate 1560k -bufsize 2600k -pass 2 -passlogfile <tmp> \
  -movflags +faststart public/media/hero-aquarium-1080.mp4

# Mobile (854×480, ~600 kbps target, scale only — never upscaled)
ffmpeg -y -i hero-source.mp4 -map_metadata -3 -an -vf scale=-2:480 -c:v libx264 -preset slow \
  -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 -profile:v high -level 3.1 \
  -b:v 600k -maxrate 720k -bufsize 1200k -pass 1 -passlogfile <tmp> -f mp4 NUL
ffmpeg -y -i hero-source.mp4 -map_metadata -3 -an -vf scale=-2:480 -c:v libx264 -preset slow \
  -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 -profile:v high -level 3.1 \
  -b:v 600k -maxrate 720k -bufsize 1200k -pass 2 -passlogfile <tmp> \
  -movflags +faststart public/media/hero-aquarium-480.mp4

# Poster frame (t=1.5 s, sharpest candidate of a scored frame sweep), then WebP
ffmpeg -y -ss 1.5 -i hero-source.mp4 -frames:v 1 -map_metadata -3 -pix_fmt rgb24 hero-poster-1500.png
# sharp: webp({ quality: 82, effort: 6 }) -> public/media/hero-aquarium-poster.webp
```

The frame at 1.5 s was chosen from a sweep at 0.5–18 s scored on Laplacian sharpness,
mean luminance, and colourfulness (frame 1.5 s scored highest).

## Delivery decision: bundled Worker static asset

The committed MP4s are served from `public/media/` through the same Worker's static asset
binding, on the site's own origin. This was decided from the platform documentation rather
than by default:

- **Cloudflare Workers static assets — adopted.** Asset requests are free and unlimited and
  there is no storage cost (<https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>),
  and the per-file limit on both free and paid plans is 25 MiB
  (<https://developers.cloudflare.com/workers/platform/limits/>). Our largest file is
  2.98 MiB, roughly one eighth of that. Delivered from the site's origin, the clip adds no
  third-party connection to the first paint. Docs accessed 2026-10-07.
- **Cloudflare Stream — rejected (paid).** Stream bills prepaid storage at $5 per 1,000
  minutes per month and post-paid delivery at $1 per 1,000 minutes
  (<https://developers.cloudflare.com/stream/pricing/>, accessed 2026-10-07). A 19-second
  loop would still require an active paid plan, and this project runs without one.
- **ImageKit video — rejected.** ImageKit's video transformations consume billable video
  processing units (<https://docs.imagekit.io/video-transformation>), and hosting the clip
  there would mean uploading the source to a third-party account. This project stores only
  images in ImageKit; the hero video's original never leaves the machine and no paid tier is
  activated.

If the media ever needs to move to a CDN, `src/lib/hero-media.ts` resolves
`HERO_VIDEO_DESKTOP_URL`, `HERO_VIDEO_MOBILE_URL` and `HERO_POSTER_URL` from the Worker
environment, so the change becomes configuration rather than a code edit.

## Runtime behaviour

Implemented by `src/components/hero-video.tsx` over the pure policy in
`src/lib/hero-video.ts`:

- The server-rendered HTML contains the `<video>` element with its poster but **no `src`**,
  so the first paint downloads the 205 KiB poster and nothing else.
- The source is attached client-side only after the policy check passes: visitors with
  `prefers-reduced-motion: reduce` or Save-Data enabled never attach the video and see the
  poster instead, with no pause control (there is nothing to pause).
- Playback is muted, inline, looping, with a visible pause/resume control. Autoplay
  rejection (browser policy) simply leaves the paused control available.
- The video pauses when the tab is hidden or the hero scrolls out of view, and resumes
  unless the visitor paused it themselves.
- A load failure degrades to the poster: the control disappears, the video is not retried,
  and the hero keeps working.

Covered by `tests/unit/hero-video.test.ts` (policy truth tables, configuration resolution)
and `tests/e2e/hero-video.spec.ts` (no video bytes in the server HTML, playback, pause
control, reduced motion, Save-Data, offscreen pause, failure degradation).
