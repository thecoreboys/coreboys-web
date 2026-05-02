/**
 * Group-level CORE socials. The handles are public; resolving a YouTube
 * @handle to its channel ID (UCxxxx) requires either:
 *
 *   - one cron job + the YouTube Data API key (recommended), or
 *   - a manual one-time lookup pasted in here.
 *
 * `youtubeChannelId` is left undefined until a channel ID is filled in.
 * See BEFORE_DEPLOY.md for the resolution recipe.
 */

export const GROUP = {
  name: "CORE",
  motto: "Create. Own. Run Everything.",
  /**
   * House tour featured video — surfaced as the looping background of the
   * parallax welcome section on the home page. Drop in the bare YouTube
   * video ID (e.g. "dQw4w9WgXcQ"). When unset the section falls back to
   * a poster-image hero so the page still looks intentional.
   */
  houseTourVideoId: "dQw4w9WgXcQ" as string | undefined,
  socials: {
    youtube: {
      handle: "@createownruneverything",
      url: "https://www.youtube.com/@createownruneverything",
      channelId: "UC6H8_DvqnEp1tYEp10GzH0g" as string | undefined,
    },
    tiktok: {
      handle: "@officialcoreboys",
      url: "https://www.tiktok.com/@officialcoreboys",
    },
    x: {
      handle: "@thecoreboys",
      url: "https://x.com/thecoreboys",
    },
    instagram: {
      handle: "@createownruneverything",
      url: "https://www.instagram.com/createownruneverything",
    },
  },
} as const;
