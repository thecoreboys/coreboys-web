# Search and link previews

Every page metadata export uses `withPageMetadata` from `lib/seo.ts`. It gives the
page its own canonical URL, description, Open Graph card, and Twitter card. Next.js
replaces nested metadata, so a page must not rely on inheriting just an image from
the root layout. Keep private account, staff, recovery, and internal search pages
out of search results.

The main share card uses the original six-member photo from
`public/special-message/core-huddle.webp`. It is fitted into a 1200 × 630 PNG without
cropping any of the faces. Creator cards use their existing public profile photos.
All cards are served as public files, without cookies or authentication.

Regenerate the cards after changing the source photos:

```sh
pnpm exec tsx scripts/generate-social-images.tsx
```

The sitemap includes canonical public sections, channels, crew profiles, fan-mail
pages, published news, and enabled Originals. Redirect aliases and private tools
are excluded. Next's default HTML-limited crawler handling keeps metadata in the
head for Twitter, Discord, WhatsApp, Apple, and other share crawlers. Do not disable
metadata streaming for normal visitors just to support link previews.
