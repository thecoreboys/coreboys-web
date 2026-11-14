# Guide layout follow-up

The Guide page and Theater guide share refinements in `app/guide-polish.css`, loaded by the app shell. The page keeps filters within the viewport, gives the member selector a full row on small phones, removes duplicate dropdown chevrons, and wraps timeline controls with 44px zoom buttons. Timeline scrolling remains local, with a subtle scrollbar.

The player guide now opens the same `GuideGrid` used by `/guide` in a full-page Radix dialog. It covers the player and its sidebar, traps focus, scrolls independently, and provides a Back to media player button. Back and Escape preserve the existing player; choosing a playable program closes the guide and tunes it. The old separate compact player timeline is no longer rendered.

Below 768px, Full schedule displays chronological cards in normal document flow. Titles wrap fully without line clamps, timestamps remain explicit, and Show more reveals additional programs per channel. Now & next titles also wrap fully. Desktop timeline cards have more room, do not scale across neighboring cards on hover, and use a tested packing helper that adds tiers at the timeline edge rather than clamping cards on top of one another. True duration geometry for the continuous desktop timeline is retained.

Verification includes TypeScript, focused guide tests, dense-card placement invariants, and browser checks. Native screenshots and geometry records are in `output/guide-ui/`.
