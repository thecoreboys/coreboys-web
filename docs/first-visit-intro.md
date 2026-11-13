# First Home visit intro

`FirstVisitIntro` keeps Home mounted behind a centered native dialog. It waits at least 1.5 seconds, downloads the complete video, prepares deferred Home shelves, and warms their artwork with four concurrent image loads. Slow external thumbnails continue loading during playback. The hero's provider player waits until the intro closes.

The supplied 45.7-second clip is served as `/intro/core-welcome-v1.mp4`. Its original soundtrack and dimensions are retained. H.264/AAC encoding with a front-loaded MP4 index reduces the download from 15,756,946 to 8,395,517 bytes. The separate voice preview is omitted at the creator's request.

Actual playback or an explicit skip records `coreboys:welcome-seen=1` in local storage, with a `core_welcome_seen` cookie fallback. The key is independent of the asset version so releases do not replay the welcome for returning visitors. Nothing is downloaded for a remembered visit. A failed preload can retry without marking the intro played. Existing main-player sessions are left in control.

Playback attempts sound, then falls back to muted autoplay if browser policy requires it. The dialog includes a sound button and a play action for browsers that block all automatic playback. It supports pause, skip, and Escape. A credit to `@underscoreemmaa` appears in the final four seconds; the actual `ended` event closes the dialog and restores scrolling.

Use a private browser window to test a fresh visit. The checks cover preparation, actual video progress, credit timing, automatic closing, persistence, download failure/retry, and autoplay recovery. Browser policy references: [Chrome autoplay](https://developer.chrome.com/blog/autoplay/) and [WebKit inline video](https://webkit.org/blog/6784/new-video-policies-for-ios/).
