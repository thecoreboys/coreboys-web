"use client";

import { useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Icosahedron } from "@react-three/drei";
import { useRef } from "react";
import type * as THREE from "three";

export function CoreObject() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.08;
    ref.current.rotation.y += delta * 0.12;
    const breath = 1 + Math.sin(state.clock.elapsedTime * 0.6) * 0.04;
    ref.current.scale.set(breath, breath, breath);
  });

  return (
    <Icosahedron ref={ref} args={[1.1, 1]}>
      {/* drei material with subtle surface displacement */}
      <MeshDistortMaterial
        color="#FF6A00"
        emissive="#FF6A00"
        emissiveIntensity={1.4}
        roughness={0.2}
        metalness={0.4}
        distort={0.28}
        speed={1.4}
      />
    </Icosahedron>
  );
}
