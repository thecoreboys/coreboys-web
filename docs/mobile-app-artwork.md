# CORE HQ home-page artwork

The home page combines generated artwork with an unchanged screenshot of the actual app interface. Generation used the built-in image generation tool.

## Saved assets

- `public/mobile-app/phone-frame.webp`: generated transparent phone frame; the display and background retain alpha transparency.
- `public/mobile-app/bedroom-scene.webp`: generated bedroom and desktop illustration.
- `public/mobile-app/remote-preview.png`: browser capture of the existing `ConnectedRemote` and `TwitchChat` components at phone width, with live public Twitch messages. The remote connection uses isolated demonstration session data; no production account or remote session was changed. A temporary development-only capture page was removed after capture. The screenshot is layered behind the generated frame in HTML, so the app interface is never redrawn by the image model.

The section uses live HTML text, gradients, and a dot pattern. The App Store destination remains the configured CORE HQ app ID, and the section carries the requested Invite Only badge.

## Final phone-frame prompt

Use case: product-mockup. Asset type: transparent smartphone device frame for a real website app screenshot, not an invented UI. Create a premium photorealistic dark titanium smartphone viewed perfectly straight-on, upright, face parallel to the image plane, absolutely no perspective or tilt. The whole device is visible and centered on a portrait 2:3 canvas. The tall phone body has an approximately 0.46 width-to-height ratio and occupies 94% of canvas height, with generous transparent side margins. Very thin black bezel, softly rounded screen corners, subtly brushed metal edge and volume buttons, delicate coral-magenta rim light on the right and cool violet rim light on the left. Both the outside background AND the entire inner display window must be transparent alpha cutouts, so an unmodified real app screenshot can be inserted behind the frame. Keep the display window completely empty and transparent. No Dynamic Island crossing the display, no status bar, no text, no symbols, no UI, no app icons, no watermark, no logos, no hands, no stand, no floor, no cast shadow. Realistic polished product render with crisp edges. Deliver only the isolated phone frame with actual transparency.

## Final bedroom-scene prompt

Use case: ads-marketing. Asset type: wide website illustration for CORE HQ, a dark streaming mobile app campaign about controlling desktop multiview from bed. Create a sophisticated cinematic 3D editorial miniature of a cozy bedroom at night: an unoccupied soft low bed with sculpted ivory duvet and lavender pillows in the foreground, a desk with a dark widescreen desktop monitor in the background toward the right. Monitor shows four softly glowing abstract video rectangles, no readable text and no invented app UI. Dark charcoal and deep plum environment, beautiful hot coral/pink and violet gradient lighting, soft cinematic shadows and fine tactile materials. Subtle curved light paths suggest wireless connection from the desktop toward the bedside. Tasteful tiny halftone dot constellations and very fine grid patterns around the scene, restrained graphic design. Landscape 16:9 composition for a home page banner; concentrate the bedroom and desk in the right two-thirds, with calm dark negative space on the left for live HTML headline copy. Leave space in the foreground center-right where a real phone screenshot device will be overlaid by the website. No people, no phone, no logos, no lettering, no words, no watermark. Premium polished product-launch art, not a busy gaming poster.
