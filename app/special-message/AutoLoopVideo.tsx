"use client";

import { useEffect, useRef, useState } from "react";

type AutoLoopVideoProps = {
  src: string;
  poster: string;
  label: string;
  className?: string;
};

export function AutoLoopVideo({ src, poster, label, className }: AutoLoopVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [allowAutoplay, setAllowAutoplay] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowAutoplay(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  // The film rail sits well below the initial viewport. Keep its still
  // poster immediately available, but defer each MP4 request until the rail
  // is approaching the screen.
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

    // The <source> is introduced after the video element has mounted. Force
    // a fresh resource selection before the first play attempt so this works
    // consistently in Safari as well as Chromium.
    video.load();
  }, [shouldLoad, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;
    if (allowAutoplay) void video.play().catch(() => { /* Native controls remain available. */ });
    else video.pause();
  }, [allowAutoplay, shouldLoad, src]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay={allowAutoplay}
      loop
      muted
      playsInline
      preload={shouldLoad ? "metadata" : "none"}
      controls
      aria-label={label}
      poster={poster}
    >
      {shouldLoad ? <source src={src} type="video/mp4" /> : null}
    </video>
  );
}
