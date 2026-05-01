# Theming

The visual + motion + type system. Every component reaches for these tokens.
If you find yourself adding an inline hex value, an off-list font size, or an
inline cubic-bezier — stop. Add it here, then use it.

---

## 1. Colors

All colors live in `app/globals.css` inside a Tailwind v4 `@theme` block, with
mirrored CSS custom properties on `:root` so non-Tailwind code can reference
them too.

| Token              | Hex       | Use                                                     |
| ------------------ | --------- | ------------------------------------------------------- |
| `--color-bg`       | `#06070A` | Page background — never pure black.                     |
| `--color-bg-elev`  | `#0E1014` | Cards, dialogs, elevated surfaces.                      |
| `--color-ink`      | `#F2F3F5` | Primary text.                                           |
| `--color-ink-dim`  | `#8A8E97` | Secondary text, kickers.                                |
| `--color-ink-faint`| `#3A3D43` | Tertiary text, rules, hairlines, dim chrome.            |
| `--color-rule`     | `#1A1D23` | Hairline borders / dividers.                            |
| `--color-core`     | `#FF6A00` | The CORE accent — molten orange.                        |
| `--color-core-2`   | `#FFB020` | Secondary heat (lighting, gradients).                   |
| `--color-core-3`   | `#FF3A00` | Tertiary heat (gradient stop).                          |
| `--color-live`     | `#FF1F3D` | Live indicators only.                                   |

### Member accents

Each member's `accent` (from `@coreboys/shared`) is the **only** other color
allowed per member. Used for hex border glow, hover halo, crew-card link
color, member-page slab, OG accent. **Don't mix a member accent with `--core`
in the same composition** unless that composition is explicitly about CORE
endorsing one member (rare).

### `--core-glow`

```css
--core-glow: linear-gradient(135deg, #ff6a00 0%, #ff3a00 50%, #ffb020 100%);
```

The molten gradient. Used in **three** places only:
- The wordmark (CORE) text fill in hero + footer
- The Concierge orb + send button
- Future: a primary CTA when one is needed (currently no pills in the hero)

Don't use it for decoration.

### Color discipline rules

- An audit is built into `NOTES.md`. New PRs that introduce a hex value should
  add the token here in the same diff.
- Anything off-palette must justify itself in the PR description.
- The live red is **only** for live state. Errors and warnings are typography,
  not color.

---

## 2. Type system

### Strict scale

Codified in `lib/type-scale.ts` AND mirrored in
`components/typography/index.tsx`. Every type size in the codebase must snap
to this list:

```
12, 14, 16, 18, 24, 32, 48, 72, 120, 200
```

Anything else is a smell.

### Tracking presets

| Where                | Tracking  |
| -------------------- | --------- |
| Display ≥ 48px       | -0.04em   |
| Display 24–32px      | -0.02em   |
| Body                 | 0         |
| Small caps           | +0.02em   |
| Kicker (uppercase)   | +0.18em   |

### Components

```tsx
import { Display, Eyebrow, Lede, Body, Caption } from "@/components/typography";

<Display size={120}>CORE</Display>
<Eyebrow>01 / Manifesto</Eyebrow>
<Lede>Six creators. One core.</Lede>
<Body>Standard paragraph copy.</Body>
<Caption>Small print, attribution.</Caption>
```

**Don't** style raw `<h1>` / `<h2>` / `<p>` outside this file. Add a variant
or a new size if you need something not on the scale, but the answer is
almost always "use the existing one."

### Display face

Currently **Inter at black weight** as an interim. The brand repo
(`coreboys-brand`) is queued to confirm Migra (Pangram Pangram) or Editorial
New (Pangram Pangram) as the licensed display face. When that lands:

1. Drop the licensed `.woff2` files into `coreboys-brand/typography/<family>/`.
2. Replace the `display = Inter(...)` import in `app/layout.tsx` with
   `next/font/local` pointing at those files.
3. Update this row.

Don't ship a non-licensed display face to production.

---

## 3. Motion

### Tokens

Codified in `lib/motion.ts`:

```ts
durations: { instant: 100, fast: 200, base: 400, slow: 700, cinematic: 1200 }   // ms
ease:      { out, in, inOut }                                                    // 4-tuple beziers
spring:    { gentle: { stiffness: 120, damping: 18 }, snappy: { stiffness: 300, damping: 24 } }
```

CSS equivalents are in `globals.css` as `--ease-out` / `--ease-in` /
`--ease-inout`. Any place that can't reach into `motion.ts` (pure CSS rules)
uses these.

### Cascade

`cascade(index, beatMs?)` returns the delay (in seconds) for the Nth child.
Default beat is 70ms. Use this when N elements should land in sequence on
section-enter — most often, member hexes and crew cards.

### Reduced motion

Honoured in:

- `LenisProvider` — bypasses smooth-scroll setup.
- `CoreScene` — replaces the canvas with `<HeroStaticPoster />`.
- `IntroSequence` — skips straight to a 200ms fade.
- `Cursor` — does not register the custom cursor.
- `Grain` — animation halts (rendered grain stays).
- `globals.css` — global `prefers-reduced-motion` rule kills CSS animations
  and transitions.

When you add a new motion sequence, add a reduced-motion equivalent — a
shorter `transition`, an instant fade, or full disable. Don't ship anything
parallax-based without one.

---

## 4. Editorial chrome

Components in `components/editorial/`:

- `<TopChrome>` — top-left "CORE" seal + top-right live indicator. Both
  fixed. Live indicator carries `aria-live="polite"`.
- `<SectionNumber index={n} label={...} />` — pin to a section's left rule;
  renders e.g. `01 / MANIFESTO`. Only shown ≥ md.
- `<Container>` — the 12-column container. Wraps section content at a max
  width of 1440px with 64px desktop / 24px mobile gutters.
- `<Grain>` + `<Scanlines>` — animated SVG noise + optional CRT overlay
  (driven by RAW mode).
- `<RawToggle>` — footer toggle that flips `[data-mode="raw"]` on `<html>`,
  persisted via localStorage.
- `<Cursor>` — custom blended cursor (24px ring). Hidden on touch devices
  and under reduced-motion. Picks up `data-accent` from hovered elements.
- `<IntroSequence>` — first-visit-only 1.2s scripted intro. Returning
  visitors get a 200ms fade. Gated by `sessionStorage`.
- `<GridOverlay>` — dev-only 12-column grid overlay. Activate with
  `?grid=1`.
- `<ConsoleEgg>` — ASCII wordmark + hiring line in the browser console.
- `<OrganizationJsonLd>` — JSON-LD Organization schema with members as
  `member`. Member pages add their own `Person` schema.

---

## 5. Three.js layer

- `components/three/CoreObject.tsx` — bespoke shader for the CORE mesh.
  Vertex displacement via 3D simplex noise; fragment fresnel rim using the
  `--core-glow` projection. Wrapped in a transmission shell for the
  molten-under-glass read.
- `components/three/OrbitNodes.tsx` — six member-tinted nodes on
  prime-period elliptical paths so they never visually sync. Each carries a
  drei `<Trail>` ribbon. Hover scales 1.4x and emits an accent flood; click
  pushes `?member=<slug>` to open the dialog.
- `components/three/Camera.tsx` — GSAP timeline + ScrollTriggers driving the
  camera dolly. Load tween, hero-to-manifesto tilt, roster retreat.
- `components/three/CoreScene.tsx` — composes the above. Restrained post
  stack (Bloom 0.6, ChromaticAberration 0.0008, DOF, Vignette 0.3, Noise
  0.04). DPR cap `[1, 2]` desktop / `[1, 1.5]` post-decline. Frameloop
  pauses on viewport-out and tab-hidden.
- `components/three/HeroStaticPoster.tsx` — Suspense + reduced-motion
  fallback. CSS-radial-gradient approximation today; ship a Blender twin
  to `/public/three/core-poster.jpg` later.

### Postprocessing tuning

The post stack is *intentionally* low-intensity. The shader does the work;
post is the polish. If you find yourself tempted to crank Bloom past 1.0,
you're masking a missing emissive in the shader.

---

## 6. Accessibility rules

- Every interactive element keyboard-reachable.
- Focus ring is global: 2px solid `--core` with 2px offset, 2px radius.
- Skip link visible on focus only (`.skip-link`).
- Respect `prefers-reduced-motion` everywhere — see §3.
- Live status changes are announced via `aria-live="polite"` regions on
  `<TopChrome>` and `<StreamContext>`.
- Color contrast for body text is AAA against `--bg`. `--ink-dim` on `--bg`
  is AA only and is reserved for non-essential dim labels (kickers and
  captions).
- The Concierge sheet is a `role="dialog"` with proper labels and a
  `role="log"` content area.

---

## 7. When to break the rules

- For one moment, on one element, with a PR that calls it out.
- If you can't justify the exception in one sentence, it isn't justified.
- "I just want to try it" → branch, prototype, decide. Don't merge it.
