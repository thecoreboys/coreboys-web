# CORE visual direction

Reference: https://contentrewards.com/ and the six screenshots supplied on November 8, 2026. Design extraction was retrieved November 8, 2026 (America/New_York). Screenshots establish desktop appearance; responsive behavior below is our implementation choice.

## What to borrow

The supplied images show a centered, generously spaced headline above a large rounded media frame, soft peach/yellow background washes, restrained navigation, pill buttons, and quiet neutral cards. Feature areas alternate large visual content with short descriptions. The Discover screenshot uses the same rounded geometry on a dark canvas. CORE adopts this hierarchy while retaining its own identity and real creator content.

The live branding extraction reports `interCore` for body copy, `suisseCore` for headings, 64px h1, 52px h2, and 17px body text. Those are extracted reference values, not the values used everywhere in CORE. Automated button/color extraction had low confidence; screenshot evidence takes precedence over those fields. No proprietary reference font, logo, creator image, customer logo, or testimonial is reused.

## Implementation choices

| Role | CORE treatment |
| --- | --- |
| Typeface | Existing self-hosted Next/font Inter; retain the separate CORE wordmark |
| Main heading | Responsive 42–72px, weight 600, 1.07 line height, tight tracking |
| Supporting copy | 16–19px, comfortable 1.65 line height |
| Section headings | 24–32px, weight 600 |
| Card text | 16px title, 14px supporting metadata |
| Content width | 1,344px outer home container with 20–48px responsive gutters |
| Section spacing | 44–72px |
| Main corners | 20–32px hero, 20px media cards, 28px library callout |
| Actions | Pill shape, 44–48px minimum targets |
| Color | Existing theme tokens with restrained rose and peach radial gradients |
| Main CTA | Deep rose gradient with white text |
| Motion | Short color/focus transitions; reduced-motion preferences respected |

The homepage opens with one clear h1 and a short description. The existing featured stream sits inside a rounded frame and supplies the primary watch action; channels and creators remain accessible through the navigation and their existing sections. The media title uses h2 on the homepage; other Billboard consumers retain their existing heading behavior. Existing content selection, playback, saves, social feeds, and library expansion remain connected.

Home rules live in `app/home-polish.css` under `.core-home`. Header rules live in `app/navigation-polish.css` and use explicit `core-topnav` hooks. This keeps the refresh away from theater, multiview, and authenticated settings layouts. Both stylesheets load after the shared responsive/refinement styles.

The light theme uses soft pink/peach washes and dark rose headline text; the dark theme uses a charcoal canvas and a lighter rose/peach headline. Image overlays retain light text on dark media. Mobile headings wrap intentionally, the existing horizontal shelves remain scrollable, and smaller creator grids use three or two columns.

## Imagery and evidence limits

Existing `WatchItem.poster`, creator portraits from the member registry, and CORE Originals artwork remain the source images. No external stock assets or reference-site imagery are required. The user screenshots are the visual reference; live extracted font metadata supports the typography assessment. Exact reference spacing, motion, mobile behavior, and private licensed font files were not inferred as facts.

## Keep the site calm

Use gradients for the opening and occasional callouts, keep ordinary content cards neutral, use one main action per decision, and keep service/status explanations in the relevant controls. Retain the accurate independent fan-site notice: a polished appearance must not imply affiliation.
