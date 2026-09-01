"use client";

import { useEffect, useRef, useState } from "react";

type AutoLoopVideoProps = {
  src: string;
  poster: string;
  className?: string;
};

export function AutoLoopVideo({ src, poster, className }: AutoLoopVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  // The film rail sits well below the initial viewport. Keep its still
  // poster immediately available, but defer each MP4 request until the rail
  // is approaching the screen. Once mounted, the existing autoplay loop
  // behavior stays exactly the same.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "420px 0px" },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) {
      return;
    }

    let resumeTimer: number | undefined;

    // The <source> is introduced after the video element has mounted. Force
    // a fresh resource selection before the first play attempt so this works
    // consistently in Safari as well as Chromium.
    video.load();

    const keepPlaying = () => {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;

      const attempt = video.play();
      void attempt?.catch(() => {
        // Muted playback can still be delayed while a browser is restoring a page.
        // The next ready/playable event retries without surfacing a broken control.
      });
    };

    const resumeAfterPause = () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(keepPlaying, 40);
    };

    keepPlaying();
    video.addEventListener("canplay", keepPlaying);
    video.addEventListener("pause", resumeAfterPause);
    video.addEventListener("ended", keepPlaying);

    return () => {
      window.clearTimeout(resumeTimer);
      video.removeEventListener("canplay", keepPlaying);
      video.removeEventListener("pause", resumeAfterPause);
      video.removeEventListener("ended", keepPlaying);
    };
  }, [shouldLoad, src]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      preload={shouldLoad ? "metadata" : "none"}
      tabIndex={-1}
      aria-hidden="true"
      poster={poster}
    >
      {shouldLoad ? <source src={src} type="video/mp4" /> : null}
    </video>
  );
}
