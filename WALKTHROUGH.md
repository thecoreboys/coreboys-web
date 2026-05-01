# Walkthrough

Section-by-section design intent. Read this before redesigning anything —
each section has a job to do that isn't obvious from the markup.

---

## 0. The intro (`<IntroSequence>`)

**Job:** establish that this isn't a content portfolio. The first second on
the site is monospace timecode counting up over black, then the wordmark
types in, then the four pillars expand, then a radial wipe reveals the hero.

**Why timecode first:** broadcast / film grammar. Establishes "we make
things, professionally." Mono small caps is the visual antithesis of
"creator landing page." The wipe is the production cue, not the content.

**Don't:** add a "skip intro" button. The intro is 1.2s. It only plays once
per session (sessionStorage). Returning visitors get a 200ms fade.

---

## 1. Hero (`<HeroCore>`)

**Job:** "this is an org, not a person." The wordmark is the lead, the drone
footage is texture, the 3D core is presence.

**Layout:**
- Drone footage parallaxes at 0.4× scroll (slower than the page).
- 3D canvas is 1× (locked to the viewport).
- Foreground typography parallaxes at 1.2× and fades out by 60% scroll.
- Editorial corners: `Eyebrow` (House · undisclosed) bottom-left, a single
  underlined chevron link bottom-right. **No twin pills.** Ever again.

**Why:** the layered depth (drone slow, canvas, text fast) is the cinematic
read. Twin pills are a SaaS-page tell — replaced with one editorial action
that earns the click.

---

## 2. Manifesto (`<Manifesto>`)

**Job:** make the acronym mean something. Each pillar pins to the viewport
and a word reveal-mask paints its meaning in `--core` while the body line
fades in beneath.

**Tuning:** the GSAP ScrollTrigger fires on `top center+=80` so the line
isn't in the user's eye when the reveal starts — it sits just below their
focal point and pulls upward. Don't change this without scrolling slowly
and sanity-checking on a real phone.

**Don't:** stagger the body line itself. The reveal-mask on the word is
already doing the work. A second stagger steps on it.

---

## 3. Roster (`<Roster>`)

**Job:** members come before any "about" filler. Six hexagonal cells in a
2×3 grid, each ramping in with a 70ms cascade.

**Hex specifics:**
- 1px clip-path hex; portrait fills the inner cell.
- Mouse-tilt parallax at 800px perspective — ±8° per axis.
- On hover, cell scales 1.02× and a member-accent radial halo blooms.
- The bottom-of-cell name + real-name lockup is **not** an afterthought —
  it's the contract: stage name in display, real name in mono small caps.
- Click pushes `?member=<slug>` and opens `<MemberDialog>` (full bio +
  per-platform tabs).

**Don't:** introduce a mosaic where one cell punches up to feature size
unless the design lands. The tempted change is in `NOTES.md` §5(2).

---

## 4. Live Now (`<LiveNow>`)

**Job:** be useful. Tells the visitor — at a glance — who's streaming
right now and what's happening on each stream.

**Per-card content (in order):**
1. Twitch thumbnail (`{width}/{height}` substituted to 640×360) with a
   subtle 1.04× hover scale.
2. `LIVE` chip top-left + viewer count top-right.
3. Stage name + stream title.
4. **AI summary** — one sentence in CORE brand voice, fetched from
   `/api/stream-context/<login>` and tagged with a small "AI" badge. Falls
   back to the game/category if Anthropic is unavailable. SWR refresh 90s.

**Empty state:** "The core is quiet." with a slow-pulse grey dot. Don't
gloss over the empty state — it's an honest read of the org's pulse.

---

## 5. House Reveal (`<HouseReveal>`)

**Job:** the Apple-keynote moment. A sticky-pinned section where the same
drone footage plays at full intensity and the line "Built in one house.
Running everything from it." lands with the cut.

**Tuning:** the line fades in over scroll progress 0.1 → 0.35 and out at
0.65 → 0.9. Don't try to make it land at the exact center — the timing is
better when it peaks slightly **before** the section midpoint, leaving
silence on the way out.

**Currently shipped as a `useScroll`/`useTransform` pin.** The "true scroll-
scrub" variant — driving `video.currentTime` from scroll progress — is
deferred. It's finicky on iOS Safari and the stable version reads stronger.

---

## 6. Crew (`<Crew>`)

**Job:** credit the people behind the lens, but stay deferential. They're
support; the members are the stars. So: smaller column headers, monospace
role labels, no portraits, hover-only reveal of socials.

Member-name links inside crew cards push `?member=<slug>` so a visitor can
click "Lacy" inside Drew Wall's card and open Lacy's dialog without leaving
this section.

---

## 7. Footer (`<Footer>`)

**Job:** close the page with the same weight the hero opened with. **60vh
tall.** Wordmark sized to break the gutter on desktop (28vw / 280px). Social
icons at 80px. Copyright in mono small caps.

**RAW toggle** lives here. Flipping it sets `[data-mode="raw"]` on `<html>`
which:
- Bumps grain opacity 4% → 8%
- Renders CRT scanlines
- Tints the page slightly amber (filter: contrast(1.06) saturate(0.92))

It's an easter egg, not a feature. Don't link to it in nav.

---

## Across all sections

- **Section numbers** (`<SectionNumber>`) pin top-left at md+. They're the
  editorial signature — a designer should be able to tell which section
  is which without reading the headline.
- **The 3D core never moves between sections.** It's the gravity. The
  camera dolly composes the manifesto and roster around it.
- **The grain is always on.** It's part of the print read. It's animated
  via `feTurbulence` on a 4-second loop so it has motion without being
  legible as motion.
- **The Concierge orb (`<Concierge>`) is bottom-right, always.** Don't
  add a "?" or "Help" tooltip — its presence is the affordance.

---

## Iteration rules

- New section → write its **job** in one sentence before designing it.
  If you can't articulate the job, don't ship the section.
- New animation → grade it 1–5 against the cinematic bar in `NOTES.md`.
  Anything ≤ 2 doesn't ship.
- New typography → snap to the scale, or add a row to the scale and update
  `THEMING.md`. No off-list sizes.
- New color → see THEMING.md §1 ("Color discipline rules").

If a designer joins next week, this document and `THEMING.md` should be
enough to iterate without me. If something here is wrong or unclear, fix
it in the same PR as the iteration.
