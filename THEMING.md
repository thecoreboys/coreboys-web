# Theming

The visual system is intentionally tight. Most of the page is two colors and
two typefaces; member accents are the *only* place additional color enters.

## Tokens

All tokens live in `app/globals.css` inside a Tailwind v4 `@theme` block, with
mirrored CSS variables on `:root` so non-Tailwind code can reference them too.

| Token                  | Value     | Use                                              |
| ---------------------- | --------- | ------------------------------------------------ |
| `--color-bg`           | `#06070A` | Page background — near-black, never pure black.  |
| `--color-bg-elev`      | `#0E1014` | Cards, dialog content, elevated surfaces.        |
| `--color-ink`          | `#F2F3F5` | Primary text.                                    |
| `--color-ink-dim`      | `#8A8E97` | Secondary text, kickers.                         |
| `--color-rule`         | `#1A1D23` | Hairline borders / dividers.                     |
| `--color-core`         | `#FF6A00` | The CORE accent — molten orange.                 |
| `--color-core-2`       | `#FFB020` | Secondary heat (used in lights, gradients).      |
| `--color-live`         | `#FF1F3D` | Live dots, "watch live" pulse.                   |

### Member accents

Each member carries an `accent` hex in `@coreboys/shared`. That accent is the
**only** place per-member color appears — hex border glow, hover halo,
crew-card link color. Don't introduce additional palette entries; if you find
yourself needing a new color, the answer is more contrast / more typographic
weight, not a new hue.

## Type

| Role     | Family                                      | Weight | Tracking | Notes                          |
| -------- | ------------------------------------------- | ------ | -------- | ------------------------------ |
| Display  | Inter (next/font, swap)                     | 700–900| `-0.04em` | Wordmarks, hero, manifesto.   |
| UI       | Inter                                       | 400–600| 0         | Body, dialog content.         |
| Mono     | JetBrains Mono                              | 400–500| `0.18em`  | Kickers, timestamps, labels.  |

`.kicker` is a small-caps label utility (`globals.css`). Use it everywhere
sections need a quiet header above the headline.

> When the design lands a custom display face (e.g. **Editorial New** or
> **Migra**), drop it in via `next/font/local` and replace `Inter` for the
> display variable only — the UI variable should keep Inter.

## Motion

- Default ease: `cubic-bezier(0.16, 1, 0.3, 1)` exposed as `--ease-expo-out`.
- Default duration: 600ms for layout transitions, 200ms for hovers.
- Honor `prefers-reduced-motion`:
  - `LenisProvider` does not init.
  - `CoreScene` returns `null`.
  - GSAP ScrollTriggers in `Manifesto` no-op.
  - The grain overlay stays — it's static.

## Texture

- A single SVG-noise grain overlay (`<div class="grain" />`) sits at the body
  root with `mix-blend-mode: overlay` at 4% opacity. It is fixed and ignores
  pointer events.
- Section dividers are 1px hairlines in `--rule` (`.rule` utility) — never a
  full divider line; the dark background does most of the work.

## Iterating on tokens

The token names in `globals.css` are also exported as Tailwind utility colors
(via the v4 `@theme` block), so `bg-bg`, `text-ink`, `border-rule`, etc. work
out of the box. To introduce a new token, add it in **one** place:

```css
@theme {
  --color-violet: #6f4dff;
}
```

…and then reference it via `bg-[color:var(--color-violet)]` or the synthesized
utility. Don't hardcode hex values in component files.
