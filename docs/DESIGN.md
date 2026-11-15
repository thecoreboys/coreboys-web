# CORE visual direction

Reference: https://contentrewards.com/ and the six screenshots supplied on November 8, 2026. Design extraction was retrieved November 8, 2026 (America/New_York). Screenshots establish desktop appearance; responsive behavior below is our implementation choice.

## What to borrow

The supplied images show generous spacing, soft peach/yellow background washes, restrained navigation, pill buttons, and quiet neutral cards. Feature areas alternate large visual content with short descriptions. The Discover screenshots use rounded cards on a dark canvas. CORE adopts that rhythm while retaining its own identity and real creator content. The user's follow-up explicitly preserves the original Netflix-style homepage hero; ambient gradients and patterns belong to inner pages and occasional callouts.

The live branding extraction reports `interCore` for body copy, `suisseCore` for headings, 64px h1, 52px h2, and 17px body text. Those are extracted reference values, not the values used everywhere in CORE. Automated button/color extraction had low confidence; screenshot evidence takes precedence over those fields. No proprietary reference font, logo, creator image, customer logo, or testimonial is reused.

## Implementation choices

| Role | CORE treatment |
| --- | --- |
| Typeface | Existing self-hosted Next/font Inter; retain the separate CORE wordmark |
| Page heading | Responsive 36–64px, weight 600, 1.08 line height, tight tracking |
| Supporting copy | 16–19px, comfortable 1.65 line height |
| Section headings | 24–32px, weight 600 |
| Card text | 16px title, 14px supporting metadata |
| Content width | 1,344px outer home container with 20–48px responsive gutters |
| Section spacing | 44–72px |
| Main corners | Full-bleed square homepage hero, 20px media cards, 24–36px callouts |
| Actions | Pill shape, 44–48px minimum targets |
| Color | Existing theme tokens with restrained rose and peach radial gradients |
| Main CTA | Deep rose gradient with white text |
| Motion | Short color/focus transitions; reduced-motion preferences respected |

The homepage opens directly with a full-width cinematic billboard. A screen-reader h1 identifies the page; the featured media title uses h2. The existing watch actions, feature rotation, channels, creator rows, saves, social feeds, and library expansion remain connected. Hero playback follows the current explicit Play action through the shared persistent player.

Home rules live in `app/home-polish.css` under `.core-home`. Navigation uses explicit `core-topnav` hooks in `app/navigation-polish.css`. Shared page introductions, account headers, legal documents, Metrics, Studio, and Fan mail are covered by `app/page-polish.css`; membership and CTA surfaces use `app/cta-polish.css`. Search, Timeline, Videos, and account settings now share the page header. `app/site-polish.css` coordinates archive controls, settings navigation, and the Guide introduction without altering player internals or timeline geometry. Channel styles retain their own brand accents while using larger network links and flexible tablet columns.

The light theme uses soft pink/peach washes; the dark theme uses charcoal with low-intensity rose light. Static curved-line patterns sit outside reading columns. Media and CTA artwork retain light text on dark overlays in either theme. Mobile headings wrap intentionally, existing horizontal shelves remain scrollable, and smaller creator grids use three or two columns. Controls use comfortable touch targets and reduced-motion preferences are respected.

## Imagery and evidence limits

Existing `WatchItem.poster`, creator portraits from the member registry, and CORE Originals artwork remain the content images. No reference-site imagery is reused. The user screenshots are the visual reference; live extracted font metadata supports the typography assessment. Exact reference spacing, motion, mobile behavior, and private licensed font files were not inferred as facts.

One decorative background was generated for this refresh: `public/design/core-atmosphere.webp` (1536×1024, approximately 37 KB). It is used in the homepage support showcase, shared CTA surfaces, and pricing panels. The original PNG remains at `C:/Users/core/.codex/generated_images/01a1bdd2-e912-7b10-8db1-90808c38b9dd/exec-05746cce-da1e-473d-93aa-96c2924f7438.png`. Art direction: quiet futuristic luxury; translucent smoked-glass arcs, satin metallic curves, charcoal with restrained rose/copper-peach highlights, spacious dark left side for readable text, art concentrated on the right and lower edge, subtle material grain, soft studio light, no text/logos/people. The final asset is format-optimized to WebP; no external stock source is involved.

## Keep the site calm

Use gradients for the opening and occasional callouts, keep ordinary content cards neutral, use one main action per decision, and keep service/status explanations in the relevant controls. Retain the accurate independent fan-site notice: a polished appearance must not imply affiliation.

The ambient finishing pass adds one soft rose/champagne wash around the homepage creator section and a bottom-lit gradient on the shared footer. Both fade into the surrounding canvas, use theme-specific low-opacity colors, and keep the existing spacing and controls. The mid-page glow narrows its vertical spread on phones; forced-color mode removes decorative layers. These accents are static CSS and add no image downloads or animation.
