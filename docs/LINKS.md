# Links — `/links`

The single URL we put in every IG bio and every podcast description.
Resolves "where do I find these guys" without forcing a visitor through
the marketing site first.

## Audience and intent

The visitor here usually came from a stream, a clip, or a social post
on someone's phone. They want to:

1. See who's live right now and click straight into the stream.
2. Find this creator on the platform they prefer (TikTok kids,
   YouTube heads, Twitch core).
3. Subscribe to the org's broadcast channels (group YouTube, group X).

We also ship this URL to brand partners as the "cleanest one-pager
that's not the press kit" — so it has to look organized, not chaotic.

## Composition

- **Header**: wordmark + tagline + "Live status updates every 60s"
  caption.
- **Live ribbon**: any member currently live appears at the top with
  their portrait, accent rule, viewer count, and a primary CTA into
  the stream. Pulses with `<LiveDot>`. When nobody is live, this row
  collapses to a single "All quiet" dim line.
- **Member rows** (six cards, one per member): each card defaults to
  the member's Twitch state (live / offline + login). Click expands
  the card to reveal their full social roster — YouTube, TikTok,
  Instagram, X, Snapchat. Expanded state stays sticky for that visit.
- **Group socials** (footer): the org's accounts — Group YouTube,
  Group X, Group Instagram. Same chip style as member socials.
- **Press / partnership**: a one-line link to `/press`.

## Visual rules

This page is shareable as a screenshot. So:

- **No 3D**. Pure DOM. Loads in <300ms even on cellular.
- **Big tap targets**: 44px+ everywhere. Mobile is the primary surface.
- **Accent-tinted cards**: each member card carries that member's
  accent in its border + bottom rule. Six accents tile the page.
- **Type**: display face for member name, mono for the platform handle,
  body for any descriptor.
- **Motion**: chip-expand uses a 240ms cubic-bezier ease. No
  hover-only interactions — every reveal must work on tap.

## State

Live status comes from the existing `useLiveStatus()` hook (60s
refresh, SWR). Member roster + socials come from `MEMBERS` /
`GROUP_SOCIALS` (`@coreboys/shared`) — no api round-trip.

Expanded card state is stored in a single client component via
`nuqs` so it survives copy-link share without leaking into history.
Default expanded state when only one card opens at a time.

## Definition of done

- `/links` 200s with all six member cards
- Live members rise to the top automatically
- Expanding a card reveals every social registered in
  `@coreboys/shared` for that member
- Mobile: a single tap (no hover) toggles expand
- The page has its own opengraph image (cinematic-but-static, members'
  portraits in a row) so social shares look on-brand
- Lighthouse ≥ 98 on a 4G profile
