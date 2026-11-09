# Text glisten

A narrow light sweep appears on the desktop navigation's Search label, the empty global search prompt, and the campaign heading's "Your coin." accent. The eight-second cycle leaves several seconds of rest between passes. Ordinary text and typed search queries remain still.

The shared style is in `app/text-polish.css`. It keeps the text's existing size and layout, with silver highlights for search and a warm champagne highlight for campaigns. Light mode uses a darker sweep to preserve legibility. Reduced motion, calm motion, and high contrast stop the animation; forced colors and printing use plain text.

Validation: TypeScript source check and all 10 search palette tests passed. Browser checks covered typed queries, clearing search, 390px mobile spacing, both themes, reduced motion, and forced colors. Native screenshots were recorded as `output/text-glisten/shimmer-preview.gif`.
