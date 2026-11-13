import { HOME_INTRO_PRELOAD_EVENT, INTRO_VIDEO_BYTES, INTRO_VIDEO_URL } from "@/lib/first-visit-intro";

export type IntroCount = { done: number; total: number };
export type HomePrepProgress = {
  /** Deferred Home shelves staged behind the intro. */
  shelves: IntroCount;
  /** Shelf artwork decoded so far. */
  artwork: IntroCount;
  /** True once the wait is over and slow artwork continues during playback. */
  deferred: boolean;
};

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

async function warmHomeImages(signal: AbortSignal, onImage: (done: number, total: number) => void): Promise<void> {
  const images = [...document.querySelectorAll<HTMLImageElement>(".core-home img")];
  let cursor = 0;
  let done = 0;
  onImage(0, images.length);
  const worker = async () => {
    while (!signal.aborted && cursor < images.length) {
      const image = images[cursor++];
      if (!image) continue;
      if (!(image.complete && image.naturalWidth > 0)) {
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
      onImage(++done, images.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

/** Prepare the real Home behind the modal, without starting provider players. */
export async function prepareHomeForIntro(signal: AbortSignal, onProgress?: (progress: HomePrepProgress) => void): Promise<void> {
  const state: HomePrepProgress = { shelves: { done: 0, total: 0 }, artwork: { done: 0, total: 0 }, deferred: false };
  const report = () => onProgress?.({ shelves: { ...state.shelves }, artwork: { ...state.artwork }, deferred: state.deferred });
  await waitFor(() => Boolean(document.querySelector(".core-home")), 4_000, signal);
  if (signal.aborted) return;
  const rails = [...document.querySelectorAll<HTMLElement>('[data-home-rail="pending"]')];
  state.shelves.total = rails.length;
  report();
  for (const rail of rails) {
    window.dispatchEvent(new CustomEvent(HOME_INTRO_PRELOAD_EVENT, { detail: rail }));
    await waitFor(() => rail.dataset.homeRail === "ready", 400, signal);
    if (signal.aborted) return;
    state.shelves.done += 1;
    report();
  }
  // Warm every shelf's artwork four at a time. Slow external images keep
  // loading during playback instead of holding the entire site on a spinner.
  const warming = warmHomeImages(signal, (done, total) => { state.artwork = { done, total }; report(); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([warming, new Promise<void>((resolve) => { timer = setTimeout(resolve, 3_000); })]);
  clearTimeout(timer);
  state.deferred = state.artwork.done < state.artwork.total;
  report();
}

/** A complete download avoids a second request or a mid-intro buffer gap. */
export async function preloadIntroVideo(signal: AbortSignal, onProgress?: (loaded: number, total: number) => void): Promise<Blob> {
  const response = await fetch(INTRO_VIDEO_URL, { cache: "force-cache", signal });
  if (!response.ok) throw new Error("intro_unavailable");
  const declared = Number(response.headers.get("content-length"));
  const total = Number.isFinite(declared) && declared > 0 ? declared : INTRO_VIDEO_BYTES;
  const type = response.headers.get("content-type") ?? "";
  let media: Blob;
  if (response.body && onProgress) {
    // Read the stream ourselves so the boot terminal shows real bytes.
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    onProgress(0, total);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, Math.max(total, loaded));
    }
    media = new Blob(chunks, { type });
  } else {
    media = await response.blob();
    onProgress?.(media.size, media.size);
  }
  if (!media.size || !media.type.startsWith("video/")) throw new Error("intro_invalid_media");
  return media;
}
