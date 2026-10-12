# Creator tags

The player **Creators** control searches an editorial directory. The six CORE
members and Adin Ross, PlaqueBoyMax and YourRAGE have initial verified profile
links. Administrators can add other creators and update aliases or social links
at `/admin/media-intelligence`.

Scheduled media-intelligence maintenance matches titles and approved captions
against this directory. Each match becomes a draft review candidate. A name
mentioned in a title or caption never automatically becomes an on-screen tag.
Admins confirm the moment, optionally provide a normalized placement, then
publish. Source revision changes, deleted assets, expired or revoked captions,
and hidden creators exclude related tags from public reads. Public snapshots
refresh every 15 seconds while the enhancement is active; playback time chooses
which tags to show without issuing a request on each video frame.

Viewers can select a rectangle on the video and suggest a five-second placement
for review. Native video can supply a frame when browser origin rules allow it.
YouTube and Twitch iframes cannot supply their pixels; these viewers can upload a
screenshot or type a visible name. Images are used only to transcribe text,
never to identify people from their appearance. Original images and facial
vectors are not stored. A hash and extracted text may be cached in Redis for
seven days; directory matches always use the current verified profiles.

Twitch's live SDK reports viewer watch time rather than a broadcast frame
timestamp. Live profile lookup remains available, but positioned timed tags are
suppressed until replay/DVR playback provides a real video timeline. YouTube
live and VOD players use their reported media timeline. No guessed live clock
is used to place a creator name over the wrong frame.

Image text transcription requires `AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_API_KEY`, and `AZURE_CREATOR_TEXT_DEPLOYMENT` (an existing
vision-capable Azure OpenAI deployment). The Azure provider has daily, hourly,
and monthly controls in the existing AI usage dashboard and shares the app's
$40 monthly ceiling. Typed directory search does not use a paid model. No model
is trained on viewer crops or creator appearances.

Apply media migration `055_creator_tags.sql` and primary migration
`054_azure_creator_text.sql` before deploying. The normal Azure workflow applies
both. The protected cron adds a `creators` stage and supports the same action at
`/api/media-intelligence/catalog-sync` for a bounded manual run.

The implementation uses Microsoft's [vision image-input format](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/gpt-with-vision)
and [Azure OpenAI v1 endpoint](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle).
