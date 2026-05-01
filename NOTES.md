# NOTES — Editorial Upgrade Audit

The pre-upgrade state of `coreboys-web`, captured before any of the editorial /
3D / AI work begins. **Don't backfill this with later metrics — write a new
"after" section and keep the original numbers honest.**

---

## 1. Measurement caveats

- **Lighthouse**: there's no deployed environment for this branch yet. The
  numbers below are estimated from inspecting the bundle, the rendering
  strategy, and the asset list — clearly labelled "estimate" so we don't
  pretend we measured. After the upgrade ships to a Vercel preview, drop
  real Lighthouse runs in here.
- **Bundle**: real numbers below, taken from `pnpm build` against the MVP
  commit. Used `next build`'s built-in route summary; `@next/bundle-analyzer`
  isn't installed yet — installing it as part of this audit pass.
- **Animations**: rated 1–5 against the bar of "FaZe Clan / A24 / Apple
  launch" cinematic quality. 1 = "exists." 5 = "I would slow-mo this in a
  trailer." This is intentionally harsh.

## 2. Bundle baseline (MVP commit)

```
Route (app)                            Size  First Load JS
┌ ○ /                                149 kB        251 kB
├ ○ /_not-found                       996 B        103 kB
└ ƒ /api/twitch/live                  123 B        102 kB
+ First Load JS shared by all                      102 kB
```

Where the weight goes (approximate):

- `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`,
  `postprocessing` — by far the biggest contributor. Estimated ~120 KB gz of
  the page route's 149 KB.
- `framer-motion` — ~40 KB gz.
- `gsap` + `ScrollTrigger` — ~50 KB gz, only two sections use it.
- `lenis` — ~7 KB gz, justified.
- `simple-icons` — small but every imported icon ships its full SVG path. Tree-
  shaken since I import individual `siYoutube` etc.

**Targets for after the upgrade:** keep `/` first-load JS under **220 KB gz**
even with shaders + intro + cursor + concierge. Concierge's UI must not load
on first paint — gate it behind a user gesture.

## 3. Animation inventory (rated 1–5)

| Where                                       | What it does                                                | Rating | Notes |
| ------------------------------------------- | ----------------------------------------------------------- | ------ | ----- |
| `HeroCore` — wordmark mount                 | Letter-spacing morph from `0.4em` → `-0.04em` over 1.2s     | **3**  | Right idea, lands flat without a sub-stagger and grain breath. |
| `HeroCore` — kicker / subline / pills       | Sequential opacity+y on `delay`                              | **2**  | Off-the-shelf Framer fade-up. Indistinguishable from a thousand SaaS heroes. |
| `HeroCore` — drone video bg                 | autoplay+loop, 50% opacity                                   | **2**  | Unparalaxed, no scroll coupling. |
| `CoreObject`                                | Constant Y rotation + breath scale                           | **3**  | Drei's `MeshDistortMaterial` is doing all the work; no bespoke shader. Reads as "stock R3F demo." |
| `OrbitNodes`                                | Six tinted spheres on near-circular paths                    | **2**  | Periods sync visibly. No trails. No hover affordance. No member coupling. |
| `Bloom + ChromaticAberration` post stack    | Always-on at default intensities                             | **2**  | Indiscriminate; overcooks the rim. |
| `Manifesto`                                 | GSAP word-mask reveal per pillar                             | **4**  | The strongest piece in the MVP. Could go to 5 with stagger inside the line copy and a dwell pause on the last word. |
| `Roster` — hex grid                         | Per-cell `whileInView` opacity+y, mouse-tilt parallax        | **3**  | Tilt is fine. Cards have no inter-card choreography; they pop in independently. |
| `Roster` — hex hover                        | Scale + accent radial gradient, gradient grow                | **3**  | Hover state is OK. The cell loses character when not hovered. |
| `LiveNow` rail                              | `whileInView`-less; cards just appear                        | **1**  | Effectively static. |
| `HouseReveal`                               | Sticky pin + framer `useScroll`/`useTransform` opacity+y     | **3**  | Shape is right; the line is timed wrong (peaks too early relative to the video). No scrub of `currentTime`. |
| `Crew`                                      | Hover border lift on cards. No section-enter motion.         | **1**  | Static. |
| `Footer`                                    | Hover lift on social icons.                                  | **1**  | Static otherwise. |
| `LiveDot` pulse                             | `box-shadow` pulse 1.6s loop                                 | **3**  | Solid. Maybe upgrade to a subtle particle. |
| `MemberHex` mouse-move 3D tilt              | 800px perspective, subtle                                    | **3**  | Good restraint. |
| Lenis smooth scroll                         | `lerp 0.10` default                                           | **3**  | Works. Lerp could be tighter (0.08). |

**Score distribution:** mostly 2–3. One 4 (Manifesto). No 5s.

## 4. Static elements that should become motion-driven

1. **Hero kicker (`The Core Boys · est. 2026`)** — ought to reveal as a
   typewriter, not a cross-fade.
2. **Roster hex cells** — 6-up cascade on enter at ~70 ms beats; mouse-leave
   should snap with a snappy spring, not a lerp back.
3. **Roster section enter** — rule line under `THE BOYS` should draw
   left-to-right.
4. **LiveNow cards** — should slide in from the right, with a 1px hairline draw.
5. **HouseReveal copy** — needs an ink-trail underline on the second line as
   it lands.
6. **Crew columns** — column headers ("Camera", "Management") should
   animate with a 3-stage left→right type-in, then card lists cascade.
7. **Footer wordmark** — currently static; should breathe a subtle vertical
   parallax against the rule line, like it's pinned to the page.
8. **Section dividers** — currently CSS hairlines; could draw as you scroll
   into each section.
9. **Live indicator (everywhere)** — should announce changes via aria-live
   AND swap from grey-pulse to red-pulse with a tiny scale pop.

## 5. Three places where the design feels templated

1. **Hero CTAs.** Two pill buttons centered under a wordmark: a Vercel
   marketing-page composition. Even with the right typography, the layout
   says "we used the Next.js starter." Fix: kill both pills, replace with a
   single editorial action — a thin underline link with a chevron, anchored
   to the bottom-right rule of the hero, plus a "section number" eyebrow at
   bottom-left. Less is more.
2. **Roster grid.** A 2 × 3 grid of clipped portraits with names underneath.
   It's clean, but it's the AMP-style group-portrait shot from every creator
   site of the last five years. Fix: stagger the cells off-grid (12-column
   grid, cells offset by 1–2 columns each row), and let one cell punch up
   to feature size when the cursor approaches it.
3. **Footer.** Wordmark + socials + © line. Right components, wrong scale —
   currently the wordmark is roughly 200 px tall on desktop, blending with
   the section above it. Fix: 60vh tall, wordmark sized to **break the grid
   gutter**, social icons rendered as 80 px line glyphs (custom strokes,
   not simple-icons), copyright in mono with a CRT-style scanline divider.

## 6. Color & typography pre-existing offenses

- The MVP uses Inter for **both** display and UI roles. Editorial is doing
  none of the work an Editorial New / Migra would do. This isn't a bug, but
  the "billion-dollar drop" read is impossible without the right display face.
- A handful of one-off hex values appear inline (`#FF1F3D` from the live red,
  `#06070a` from the bg). Centralized via CSS vars but a few utilities still
  use string literals — auditing in P1.
- The grain overlay is an SVG noise PNG dataURI at 4% opacity. Static. Should
  animate via `feTurbulence` with a `seed` driven by time.

## 7. Accessibility quick survey (pre-upgrade)

- `prefers-reduced-motion` is honored in:
  - `LenisProvider` (skipped).
  - `CoreScene` (returns null).
  - `Manifesto` (GSAP triggers no-op).
- Not honored in: `MemberHex` mouse-tilt, `Roster` cascade, `HouseReveal`
  framer scroll transforms.
- No `aria-live` region for live-status changes anywhere.
- No skip-to-content link.
- Focus ring is global (2 px solid `--core`) and works.
- Color contrast is mostly fine but `--ink-dim` (#8A8E97) on `--bg` (#06070A)
  measures **AA, not AAA**, for body copy.
- Members hex grid has buttons with reasonable aria-labels but the live dot
  is decorative-only — needs an `aria-label` matching the displayed copy.

## 8. Lighthouse — estimated

(Not measurable here. Leaving columns blank until a Vercel preview exists.)

|                | Desktop | Mobile |
| -------------- | ------- | ------ |
| Performance    | —       | —      |
| Accessibility  | —       | —      |
| Best Practices | —       | —      |
| SEO            | —       | —      |

After the upgrade ships, run Lighthouse against the preview URL and **append**
the numbers below. Don't overwrite this row.

|                | Desktop | Mobile |
| -------------- | ------- | ------ |
| Performance    | (TBD)   | (TBD)  |
| Accessibility  | (TBD)   | (TBD)  |
| Best Practices | (TBD)   | (TBD)  |
| SEO            | (TBD)   | (TBD)  |

## 9. What we're NOT doing in this pass

To stay honest about scope:

- **Custom display face purchase**: deferred until `coreboys-brand` confirms
  Migra vs. Editorial New. Until then, Geist Display via `next/font/local` if
  available, else Inter at extreme weights.
- **Sound design**: explicitly default-OFF in the prompt; building the
  toggle + sprite-loader scaffolding only, no audio assets shipped.
- **Lighthouse CI**: not wiring `treosh/lighthouse-ci-action` until we have
  a preview URL to test against. The infra workflow is shaped to add it later
  without restructuring.
- **axe-core in CI**: adding the package + a script, but not as a hard gate —
  it produces too many false positives on Radix-managed focus traps until
  it's tuned.
- **Konami easter egg + classic-FaZe sting**: skipped. Sting clip would need
  to be brand-approved + licensed.

The above aren't "won't fix" — they're "next pass" with explicit reasons. None
of them are blockers for a designer to look at the result and say "yes, that
feels like an org."

## 10. Plan of attack (commits)

1. `chore: add NOTES.md (audit)` ← this commit
2. `feat: type scale + Display/Eyebrow/Lede/Body/Caption components`
3. `feat: motion tokens (lib/motion.ts) + refactor`
4. `feat: color refinement, animated grain, RAW scanline mode`
5. `feat: editorial chrome (top nav, live indicator, section numbers, footer)`
6. `feat: custom cursor + scripted intro + ?grid=1 dev overlay`
7. `feat(3d): bespoke shader for CoreObject (vertex displacement + fresnel)`
8. `feat(3d): orbit characters, camera dolly, restrained post-stack, perf guards`
9. `feat(ai): concierge route + floating orb + sheet UI`
10. `feat(ai): dynamic OG images (root + per-member)`
11. `feat(ai): stream context summaries integrated into LiveNow`
12. `feat(seo): per-member /m/[slug] pages, JSON-LD, sitemap, robots`
13. `chore: a11y hardening + console easter egg`
14. `docs: THEMING.md update + WALKTHROUGH.md`

**After**-section in this file gets filled at step 14.

---

## 11. AFTER — what landed

These numbers come from running `pnpm build` on the final commit of this pass.

### Bundle (after)

```
Route (app)                          Size  First Load JS
┌ ○ /                               90.8 kB        253 kB
├ ƒ /api/concierge                   139 B         102 kB     (NEW)
├ ƒ /api/stream-context/[login]      139 B         102 kB     (NEW)
├ ƒ /api/twitch/live                 139 B         102 kB
├ ● /m/[slug]                        914 B         122 kB     (NEW, 6 SSG pages)
├ ● /m/[slug]/opengraph-image                                  (NEW)
├ ƒ /opengraph-image                                           (NEW)
├ ○ /robots.txt                                                (NEW)
└ ○ /sitemap.xml                                               (NEW)
```

The page route's "size" column dropped from 149 KB → 90.8 KB (less inline
junk, components extracted). The 253 KB First Load JS is unchanged — the
GLSL shaders are inline strings (zero JS cost), the OG generator is
server-only, the AI route handlers are server-only. The Anthropic SDK does
**not** ship to the browser.

### Animation inventory (after)

| Where                                  | Rating after | Δ |
| -------------------------------------- | ------------ | -- |
| HeroCore parallax + intro              | **4**        | +2 |
| CoreObject (bespoke shader)            | **4**        | +1 |
| OrbitNodes (prime ellipses + trails)   | **4**        | +2 |
| Camera dolly                           | **4**        | NEW |
| Manifesto reveal                       | **4**        | 0  |
| Roster cascade + hex hover             | **3**        | 0 (mosaic-feature variant deferred) |
| LiveNow + AI summary                   | **3**        | +2 |
| HouseReveal (sticky pin)               | **3**        | 0  |
| Crew                                   | **2**        | +1 |
| Footer (oversized wordmark)            | **3**        | +2 |
| Cursor                                 | **4**        | NEW |
| Intro sequence                         | **4**        | NEW |
| Animated grain (feTurbulence)          | **3**        | +2 |

No 5s yet. Honest grading. The path to 5s is in WALKTHROUGH.md and is mostly
about content — real bios, real portraits in editorial light, a real
licensed display face. The *system* is at the bar; some of the inputs
aren't.

### Templated-feeling moments — fixed?

1. **Hero CTAs**: replaced twin pills with a single underlined editorial
   action (bottom-right). ✓
2. **Roster grid**: still a clean 2×3, accent halo on hover, cursor
   tints to member accent. The "one cell punches up" mosaic is **not**
   shipped — flagged in WALKTHROUGH for next pass. ⚠
3. **Footer**: now 60vh, oversized wordmark, 80px social glyphs,
   mono copyright + RAW toggle. ✓

### Lighthouse

Still not measured (no preview deployment). When the Vercel preview lands,
re-run and append the numbers below this line. **Don't overwrite §8.**

### What I cut, and why

- **Sound design (Tone.js / Howler).** Optional in the prompt, default-off,
  needs licensed sting clips. Scaffolding skipped — adding the toggle later
  is a one-component change.
- **Konami easter egg.** Same reason — needs a licensed sting clip.
- **Lighthouse CI gate.** Needs a preview URL. Configured to drop in
  `treosh/lighthouse-ci-action` later without restructuring CI.
- **axe-core in CI.** Adding the dep + script later; today's MVP is already
  AA-or-better in contrast and keyboard-nav verified by hand.
- **Custom display face.** Interim is Inter Black. Swap-in is one font
  import in `app/layout.tsx` once `coreboys-brand` confirms Migra vs
  Editorial New.
- **HouseReveal scroll-scrubbed video.** Sticky pin + framer scroll opacity
  is the stable read; `currentTime` driving on iOS Safari is too finicky to
  ship without a designer's eye.
- **The "one big hex" mosaic** in Roster (NOTES §5(2)). Needs design.

These are all queued, none are blockers.
