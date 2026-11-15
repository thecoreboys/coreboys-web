# Interface direction

The public site should feel modern, simple, and considered, like a luxury app.

- Use the existing Inter typeface with medium-weight, closely spaced headings and readable supporting copy. Keep metadata secondary without making controls tiny.
- Build around near-black or warm-white surfaces, subtle neutral borders, and generous, consistent spacing. Reserve the CORE accent for primary actions and meaningful signals.
- Use flat controls with consistent rounded corners. Avoid decorative bevels, competing outlines, glowing badges, and routine animated status indicators.
- Put secondary actions beside the section title. Icon actions need a clear accessible name, visible keyboard focus, and a 44px touch target.
- Use simple text navigation on wide screens. Switch crowded filters to a single labelled selector on phones and tablets.
- Align section titles, filters, and cards to the same gutter. Cards should let artwork and content carry the visual weight.
- Preserve functional state, contrast preferences, reduced motion, and accessible labels. Check narrow phones, tablets, desktop, and both appearance modes when changing shared components.

The shared foundation lives in `app/ui-refinements.css`, the base controls, and the shared page header. The home X feed uses the same principles in its component styles.
