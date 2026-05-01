"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { MEMBERS } from "@/lib/members";

type NodeConfig = {
  slug: string;
  color: string;
  radiusX: number;
  radiusZ: number;
  speed: number;
  phase: number;
  tiltY: number;
  tiltX: number;
};

export function OrbitNodes() {
  const groupRef = useRef<THREE.Group>(null);
  const nodes = useMemo<NodeConfig[]>(
    () =>
      MEMBERS.map((m, i) => ({
        slug: m.slug,
        color: m.accent,
        radiusX: 2.4 + (i % 3) * 0.25,
        radiusZ: 2.0 + ((i + 1) % 3) * 0.25,
        speed: 0.18 + (i % 4) * 0.04,
        phase: (i / MEMBERS.length) * Math.PI * 2,
        tiltY: (i - 2.5) * 0.18,
        tiltX: ((i + 1) % 3 === 0 ? 1 : -1) * 0.22,
      })),
    [],
  );

  const meshRefs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const angle = n.phase + t * n.speed;
      const x = Math.cos(angle) * n.radiusX;
      const z = Math.sin(angle) * n.radiusZ;
      const y = Math.sin(angle * 1.3 + n.tiltY) * 0.5;
      mesh.position.set(x, y, z);
      mesh.rotation.x = angle * 1.5;
      mesh.rotation.y = angle;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.18, 0, 0.05]}>
      {nodes.map((n, i) => (
        <mesh
          key={n.slug}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.09, 24, 24]} />
          <meshStandardMaterial
            color={n.color}
            emissive={n.color}
            emissiveIntensity={2.4}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
