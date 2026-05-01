"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
  DepthOfField,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { CoreObject, CoreShell } from "./CoreObject";
import { OrbitNodes } from "./OrbitNodes";
import { Camera } from "./Camera";
import { HeroStaticPoster } from "./HeroStaticPoster";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * The hero canvas. Composes:
 *   - bespoke shader CoreObject + transmission shell
 *   - prime-period orbit nodes with hover affordances
 *   - GSAP-driven scripted camera (Camera.tsx)
 *   - restrained postprocessing stack
 *   - <PerformanceMonitor> degrades quality if FPS dips
 *   - IntersectionObserver pauses the frameloop when off-screen
 *   - visibilitychange pauses when tab hidden
 *   - prefers-reduced-motion → static poster fallback
 *   - Click on a node opens the corresponding member dialog (?member=slug)
 */
export function CoreScene() {
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true); // viewport-visible AND tab-visible
  const [perfTier, setPerfTier] = useState<"high" | "low">("high");
  const [hoverColor, setHoverColor] = useState<string | null>(null);

  // Pause frameloop when off-viewport.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver(
      ([entry]) => setActive((prev) => (entry ? entry.isIntersecting : prev)),
      { threshold: 0 },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  // Pause when tab hidden.
  useEffect(() => {
    const onVisibility = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (reduced) {
    return (
      <div ref={hostRef} className="absolute inset-0 pointer-events-none">
        <HeroStaticPoster />
      </div>
    );
  }

  return (
    <div ref={hostRef} className="absolute inset-0 pointer-events-none">
      {/* Member-accent flood while a node is hovered. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 [transition-timing-function:var(--ease-out)]"
        style={{
          opacity: hoverColor ? 1 : 0,
          background: hoverColor
            ? `radial-gradient(60% 60% at 50% 55%, ${hoverColor}33 0%, transparent 70%)`
            : undefined,
        }}
      />

      <Suspense fallback={<HeroStaticPoster />}>
        <Canvas
          className="!absolute inset-0"
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={perfTier === "high" ? [1, 2] : [1, 1.5]}
          camera={{ position: [0, 0.4, 12], fov: 42 }}
          frameloop={active ? "always" : "never"}
          style={{ pointerEvents: "auto" }}
        >
          <PerformanceMonitor
            onDecline={() => setPerfTier("low")}
            onIncline={() => setPerfTier("high")}
            flipflops={3}
          />

          <color attach="background" args={["#06070a"]} />
          <fog attach="fog" args={["#06070a", 6, 18]} />

          <ambientLight intensity={0.18} />
          <pointLight position={[3, 4, 4]} intensity={2.2} color="#FFB020" />
          <pointLight position={[-4, -2, 3]} intensity={1.7} color="#FF6A00" />

          <Camera />
          <PointerTracker>
            {(mouseY) => <CoreObject mouseY={mouseY} />}
          </PointerTracker>
          <CoreShell />
          <OrbitNodes onHover={(_, color) => setHoverColor(color)} onClick={openMember} />

          <EffectComposer multisampling={0} enabled={perfTier === "high"}>
            <Bloom
              intensity={0.6}
              luminanceThreshold={0.85}
              luminanceSmoothing={0.4}
              mipmapBlur
            />
            <ChromaticAberration
              blendFunction={BlendFunction.NORMAL}
              offset={new THREE.Vector2(0.0008, 0.0008)}
              radialModulation={false}
              modulationOffset={0}
            />
            <DepthOfField focusDistance={0} focalLength={0.04} bokehScale={2} height={480} />
            <Vignette eskil={false} offset={0.5} darkness={0.3} />
            <Noise opacity={0.04} blendFunction={BlendFunction.OVERLAY} />
          </EffectComposer>
        </Canvas>
      </Suspense>
    </div>
  );
}

/**
 * Listens to window pointermove and exposes a normalized -1..1 mouseY value
 * to its child render-prop, used by CoreObject's wobble.
 */
function PointerTracker({
  children,
}: {
  children: (mouseY: number) => React.ReactNode;
}) {
  const { gl } = useThree();
  const yRef = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      yRef.current = ((e.clientY - rect.top) / rect.height) * -2 + 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [gl]);

  // Render once with the latest mouseY; useFrame inside child reads via prop.
  return <>{children(yRef.current)}</>;
}

function openMember(slug: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("member", slug);
  window.history.pushState({}, "", url);
  // Notify any listeners (Roster's nuqs hook reads searchParams on render).
  window.dispatchEvent(new PopStateEvent("popstate"));
}
