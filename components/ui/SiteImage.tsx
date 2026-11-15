"use client";

import Image, { type ImageProps } from "next/image";
import { forwardRef } from "react";

/** Optimize bundled artwork; keep signed/provider-owned image URLs intact. */
const SiteImage = forwardRef<HTMLImageElement, ImageProps>(function SiteImage(props, ref) {
  const remote = typeof props.src === "string" && /^(?:https?:|data:|blob:|\/\/)/i.test(props.src);
  return <Image {...props} alt={props.alt} ref={ref} unoptimized={props.unoptimized ?? remote} />;
});

export default SiteImage;
export type { ImageProps };
