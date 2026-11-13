# Media autoplay

Previews start muted and inline. Watch respects the autoplay preference, data saver, reduced motion, hover intent, and page visibility. Provider readiness and a loaded iframe are distinct from confirmed playback. Sound remains a viewer action.

Compact cards and expanded hover previews use the same source resolver: supplied native video, a supported YouTube/Twitch/TikTok player, or a catalog-matched cross-post. Approved signed video URLs work without a file extension. Legacy direct-video links also resolve in Theater and multiview. Photos and provider permalinks never become native video sources.

Instagram's official embed has no supported autoplay command. Active Reel previews and players can instead resolve a fresh video URL from **already cached** Social Fetch first-page responses for the CORE roster. `/api/watch/instagram-playback` only reads that cache; it never calls the provider or reserves credits. These disposable URLs are restricted to Instagram/Facebook media CDNs, expire before their signed URL/cache deadline, and are never written into the permanent catalog. Missing or failed native sources retain the official embed/source fallback. Older archive entries outside the current cache may still require a tap in Instagram's player.

YouTube and TikTok players retry muted playback after provider readiness with a bounded startup window. YouTube also subscribes to autoplay-blocked events. Inline clip/article players use the same embed builder and startup handshake, mount only while visible, and stop startup retries after playback begins so a manual pause is respected. The iPhone WebView already permits inline autoplay without requiring a media gesture.

Full native playback retries an audible browser-policy rejection once with mute enabled. Unsupported media, network failures, and explicit pauses do not trigger that recovery. A resolved native Reel replaces the active short-form iframe, including any preloaded instance.

Provider references: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [TikTok player](https://developers.tiktok.com/docs/en/embed-player), [Twitch video embeds](https://dev.twitch.tv/docs/embed/video-and-clips/), [Instagram embeds](https://developers.facebook.com/docs/instagram-platform/oembed/).
