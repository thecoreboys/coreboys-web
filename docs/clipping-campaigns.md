# Clipping campaigns

The “Your clips. Your coin.” section is shared by the Netflix-style Home page and `/clips`. Manage it at `/admin/campaigns` through the **Clipping campaigns** tile in Admin. Existing staff authentication and admin permissions protect all reads and writes.

## Publishing an ad

1. Select an existing campaign or choose **New campaign** (new entries start as drafts).
2. Enter the Content Rewards campaign link, short title, creator/brand, actual campaign artwork, optional community logo, reward type, budget, and eligible platforms.
3. Enter the organizer's launch and closing times when confirmed. Unknown closing dates stay blank.
4. Set **Show ad from** and **Stop showing ad at**, choose Home and/or Clips, then set **Published — follow schedule** and save. Preview shows unsaved edits without making them public.

Both website display times are required to publish. The effective window starts at the later of the campaign launch or website start and ends at the earlier of the campaign close or website deadline. End times are exclusive. Dates are stored as UTC instants; admins enter their local time. Public dates use UTC, with exact times available in each date's tooltip. Website deadlines are labeled **Featured until**, while confirmed organizer deadlines are labeled **Ends**.

Drafts and archived ads are hidden. Published ads automatically become scheduled, live, or expired according to their timestamps. When the last ad expires, the entire public section disappears. The public endpoint is uncached, filters dates at query and response time, and returns no draft data or staff identifiers. Open pages remove cards at their deadline using a timer anchored to the server clock, including when the page regains visibility. New or edited ads refresh within a minute or on page focus.

Changing status to Draft pauses an ad; Archived retains it for later reference. Conflicting edits return 409 rather than overwriting a newer revision. Duplicate canonical campaign links are rejected. Published ads cannot have an unbounded display window, including through direct database writes.

## Imported campaigns and sources

Checked on 2026-11-09 UTC against each public Content Rewards campaign page and its embedded campaign data. After the owner confirmed that these promotions usually run for 30 days, the supplied five campaigns were activated with **30-day website display windows from their verified launch timestamps**. These deadlines are labeled “Featured until”; the organizer closing timestamps remain unknown and are not invented. Admins can shorten, extend, pause, or replace these dates. Initial imports never overwrite an admin's existing edits.

The first activation updated only the five untouched imported drafts (revision 1, no staff edits, and no display dates), preserving any admin-customized records. The resulting website deadlines are Nov 19 for both Lacy campaigns, Nov 30 for Jason, Dec 1 for CORE in Shibuya, and Dec 4 for TapCap, all in 2026 UTC.

| Campaign | Launch (UTC) | Reward | Budget | Source |
| --- | --- | --- | --- | --- |
| CORE in Shibuya | Nov 1, 2026, 08:10:49 | $1 / 1K approved views | $20,000 | [CORE campaign](https://contentrewards.com/c/campaigns/432f45b8-ed16-4cc6-95d7-1655e6c7806a) |
| TapCap | Nov 4, 2026, 21:28:23 | $1.35 / 1K approved views | $5,000 | [TapCap campaign](https://contentrewards.com/c/campaigns/a2a0e028-45d8-4b11-8276-5d7d7fb22cab) |
| Lacy | Oct 20, 2026, 22:15:03 | Shared pool | $25,000 | [Lacy social campaign](https://contentrewards.com/c/campaigns/4479e5e2-9a00-489e-8b0c-345834f37cc7) |
| Jason | Oct 31, 2026, 17:21:26 | Shared pool | $9,000 | [Jason campaign](https://contentrewards.com/c/campaigns/0b178e3c-fbd3-4294-8ded-394e3da9c62f) |
| Lacy on X | Oct 20, 2026, 22:15:06 | Shared pool | $5,000 | [Lacy X campaign](https://contentrewards.com/c/campaigns/20b7c977-8d0c-4bd0-b9b0-2db9200f405b) |

Cards link to the organizer for eligibility, approval, current funding, deadlines, and payouts. There is no promise of earnings or on-site payout flow. Campaign information is curated by admins; the feature does not continually scrape the organizer or automatically detect depleted funding. Review the source before publishing or extending a promotion.

The attached PDF contained unrelated visual notes, not campaign scheduling data. It was used as visual reference only.

## Artwork

Each UUID-named WebP in `public/campaigns/` is the official public banner from its corresponding campaign, not a generated likeness. The CORE banner includes all six members, TapCap shows the actual product, and the Jason/Lacy banners show their respective creators. Community logos reuse the existing local assets.

Official image sources, in the table order above, all under `https://crusercontent.com/fe520411-733d-5812-a383-b56f9575d049/campaigns/thumbnails/`:

- CORE: `0f2035c4-3283-43dc-a32a-a604a413d9c0.webp`
- TapCap: `09ee9996-69c4-45f5-93cf-50bbbe95eebb.webp`
- Lacy social: `b9fc9813-6720-4914-841f-ad8e95bad2ab.webp`
- Jason: `45c1ba72-1c77-432b-85fd-1e50b2659e91.webp`
- Lacy X: `ae83a4a4-6c2e-4aba-ab5d-4f4f42a3eb3e.webp`

Decorative image `public/campaigns/clipping-studio.webp` is a new generated background, optimized to approximately 38 KB. Built-in image generation, new image mode, no reference images. Original retained at `C:/Users/core/.codex/generated_images/01a1bdd2-e912-7b10-8db1-90808c38b9dd/exec-3e2b0fc5-edbe-4c0c-824b-bfe6e06f5648.png`.

Prompt: “Use case: ads-marketing. Asset type: understated premium website campaign-section background, wide landscape 1536 by 1024. Create a photoreal editorial studio still life for a modern creator clipping platform, with a brushed titanium film/editing reel edge, a few thin champagne brass discs with no currency symbols, translucent smoked acrylic vertical frames and subtle peach light on a deep charcoal/plum tabletop. Tactile, believable industrial design photography, natural tiny material imperfections, high-end startup campaign art direction. Composition: left 60 percent is spacious near-black empty negative space for a headline; objects sit at the far right and lower-right and fade into darkness. Warm silver and muted copper, restrained cinematic side light, no neon, no excessive bloom, no crypto aesthetic, no floating magical objects, no people, no faces, no hands, no letters, no text, no logos, no watermarks, no interface. This is a background artwork only. It will be paired with real creator portraits and the actual campaign product artwork in HTML, so leave a calm soft scene that does not compete with those images.”

## Storage and verification

Additive migration: `scripts/migrations/063_clipping_campaigns.sql`, also registered with the web migration runner. `ensureCampaignSchema` self-initializes the same table and imports the five bounded promotions idempotently. Existing edited campaigns and clip records are not rewritten.

Automated checks cover schedule boundaries, invalid schedules, placement/status filtering, URL and reward validation, admin authorization before persistence, cross-origin rejection, conflicting revisions, duplicate links, and no-cache public responses. A PostgreSQL transaction verified save → publish → placement filtering → exact expiry → revision conflict → archive and the database's bounded-schedule constraint, then rolled back every test row.

Validation on 2026-11-09: source TypeScript check passed; full suite had 1,159 passes, one skip, zero failures. The nine campaign tests also passed after canonical-link validation changed. Browser checks covered a 390px phone and a 1280px desktop, scrolling/arrow controls, loaded official artwork, inline validation and focus, unpublished previews, preserving unsaved edits when switching campaigns, and resetting edits. A real client section using an isolated 14-second test feed visibly disappeared at expiry without a reload. The normal Home hero and Clips page remained functional; real public feeds returned no drafts, while anonymous admin access returned 401 or redirected to sign-in. No staff credentials or authentication bypass were used for layout testing.

Design evidence from the initial draft review: `output/campaigns/desktop-preview.jpg`, `mobile-preview.jpg`, and `admin-desktop.jpg`. The five actual database entries are now published according to their 30-day website windows, after the owner's duration clarification. Current public API checks return all five with their display deadlines and no staff data.
