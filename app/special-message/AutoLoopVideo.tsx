"use client";

import { useEffect, useRef } from "react";

type AutoLoopVideoProps = {
  src: string;
  poster: string;
  className?: string;
};

export function AutoLoopVideo({ src, poster, className }: AutoLoopVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    let resumeTimer: number | undefined;

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
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      tabIndex={-1}
      aria-hidden="true"
      poster={poster}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
