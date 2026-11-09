# Responsive sizing follow-up

The global search panel now loads its complete layout with the app shell (`app/watch-search.css`). Previously, its base global styles and a separately loaded CSS module could leave the header actions stacked, the decorative input hint in normal flow, and result thumbnails crowding their copy during development updates.

Header actions cannot wrap, the input and hint share a stable field, result copy can shrink within its grid column, and the results retain a scroll region on short landscape screens. A compact adjustment covers widths below 360px.

Home shelf portrait cards now have a 168px minimum width for readable metadata. Their artwork retains its proportions with contain sizing. Landscape cards are capped to the available viewport width. Shared artwork and metadata heights remain aligned within each shelf.

Browser validation covered search at 320×568, 390×844, 768×1024, 1024×768, 1440×900, and 844×390. All had aligned hints, separate header controls and thumbnail/copy columns, and no dialog overflow. Typed search was also checked at 320px. Home shelves were checked at 320, 390, 768, and 1440px, with no document overflow or artwork/copy overlap. Clips controls were checked from 320 through 2560px without document overflow. The video library empty state was inspected separately.

TypeScript validation and all ten search palette tests passed. Native screenshots and geometry results are in `output/responsive-sizing/`.
