"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { CoreObject } from "./CoreObject";
import { OrbitNodes } from "./OrbitNodes";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function CoreScene() {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function onVisibility() {
      setVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (reducedMotion) return null;

  return (
    <Canvas
      className="!absolute inset-0 pointer-events-none"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, 1.6]}
      camera={{ position: [0, 0.4, 5.4], fov: 42 }}
      frameloop={visible ? "always" : "never"}
    >
      <color attach="background" args={["#06070a"]} />
      <fog attach="fog" args={["#06070a", 6, 14]} />

      <ambientLight intensity={0.15} />
      <pointLight position={[3, 4, 4]} intensity={2.4} color="#FFB020" />
      <pointLight position={[-4, -2, 3]} intensity={1.8} color="#FF6A00" />

      <Suspense fallback={null}>
        <CoreObject />
        <OrbitNodes />
      </Suspense>

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.2}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.6}
          mipmapBlur
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0008, 0.0012)}
          radialModulation={false}
          modulationOffset={0}
        />
      </EffectComposer>
    </Canvas>
  );
}
