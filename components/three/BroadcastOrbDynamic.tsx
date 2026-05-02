"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper for the BroadcastOrb. We disable SSR because
 * R3F + three.js touch the WebGL context and `window`. Server components
 * can import this directly because it's a client module.
 */
const BroadcastOrb = dynamic(
  () => import("@/components/three/BroadcastOrb").then((m) => m.BroadcastOrb),
  { ssr: false, loading: () => null },
);

export function BroadcastOrbClient() {
  return <BroadcastOrb />;
}
