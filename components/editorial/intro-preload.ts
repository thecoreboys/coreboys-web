import { HOME_INTRO_PRELOAD_EVENT, INTRO_VIDEO_URL } from "@/lib/first-visit-intro";

function waitFor(test: () => boolean, timeout: number, signal: AbortSignal): Promise<void> {
  if (test() || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); observer.disconnect(); signal.removeEventListener("abort", finish); resolve(); };
    const observer = new MutationObserver(() => { if (test()) finish(); });
    const timer = setTimeout(finish, timeout);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-home-rail"] });
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function warmHomeImages(signal: AbortSignal): Promise<void> {
  const images = [...document.querySelectorAll<HTMLImageElement>(".core-home img")];
  let cursor = 0;
  const worker = async () => {
    while (!signal.aborted && cursor < images.length) {
      const image = images[cursor++];
      if (!image) continue;
      if (image.complete && image.naturalWidth > 0) continue;
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); image.removeEventListener("load", finish); image.removeEventListener("error", finish); signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, 5_000);
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
        signal.addEventListener("abort", finish, { once: true });
        image.loading = "eager";
        image.decoding = "async";
        if (image.complete) finish();
      });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

/** Prepare the real Home behind the modal, without starting provider players. */
export async function prepareHomeForIntro(signal: AbortSignal): Promise<void> {
  await waitFor(() => Boolean(document.querySelector(".core-home")), 4_000, signal);
  if (signal.aborted) return;
  for (const rail of document.querySelectorAll<HTMLElement>('[data-home-rail="pending"]')) {
    window.dispatchEvent(new CustomEvent(HOME_INTRO_PRELOAD_EVENT, { detail: rail }));
    await waitFor(() => rail.dataset.homeRail === "ready", 400, signal);
    if (signal.aborted) return;
  }
  // Warm every shelf's artwork four at a time. Slow external images keep
  // loading during playback instead of holding the entire site on a spinner.
  const warming = warmHomeImages(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([warming, new Promise<void>((resolve) => { timer = setTimeout(resolve, 3_000); })]);
  clearTimeout(timer);
}

/** A complete download avoids a second request or a mid-intro buffer gap. */
export async function preloadIntroVideo(signal: AbortSignal): Promise<Blob> {
  const response = await fetch(INTRO_VIDEO_URL, { cache: "force-cache", signal });
  if (!response.ok) throw new Error("intro_unavailable");
  const media = await response.blob();
  if (!media.size || !media.type.startsWith("video/")) throw new Error("intro_invalid_media");
  return media;
}
