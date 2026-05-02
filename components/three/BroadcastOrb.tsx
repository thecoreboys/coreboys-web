"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Broadcast wireframe orb — ported from the maintenance lander
 * (`thecoreboys-landing`). Looks like a stylised studio mic / signal
 * sphere: an icosahedron whose vertices breathe along the surface,
 * orbiting torus rings, and a soft particle field around it.
 *
 * Rendered transparent so it composites over the corporate dark hero.
 */
function OrbContents() {
  const wireRef = useRef<THREE.LineSegments>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const wireGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2.2, 2);
    return new THREE.EdgesGeometry(geo);
  }, []);

  const basePositions = useMemo(() => {
    const attr = wireGeo.attributes.position;
    if (!attr) return new Float32Array(0);
    return Float32Array.from(attr.array as Float32Array);
  }, [wireGeo]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (wireRef.current) {
      wireRef.current.rotation.x = t * 0.08;
      wireRef.current.rotation.y = t * 0.12;
      const positions = wireRef.current.geometry.attributes
        .position as THREE.BufferAttribute;
      const arr = positions.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = basePositions[i] ?? 0;
        const by = basePositions[i + 1] ?? 0;
        const bz = basePositions[i + 2] ?? 0;
        const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
        const wave =
          Math.sin(t * 1.6 + bx * 1.4 + by * 0.9) * 0.06 +
          Math.cos(t * 1.1 + bz * 1.2) * 0.04;
        const k = 1 + wave;
        arr[i] = (bx / len) * len * k;
        arr[i + 1] = (by / len) * len * k;
        arr[i + 2] = (bz / len) * len * k;
      }
      positions.needsUpdate = true;
    }

    if (innerRef.current) {
      innerRef.current.rotation.x = -t * 0.05;
      innerRef.current.rotation.y = -t * 0.07;
      const m = innerRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.04 + (Math.sin(t * 2.0) + 1) * 0.03;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.18;
    }
  });

  return (
    <group>
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[1.85, 1]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.06} />
      </mesh>

      <lineSegments ref={wireRef} geometry={wireGeo.clone()}>
        <lineBasicMaterial color="#f4f4f5" transparent opacity={0.7} />
      </lineSegments>

      <mesh ref={ringRef} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[3.4, 0.005, 8, 200]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.55} />
      </mesh>

      <mesh rotation={[Math.PI / 1.6, 0.3, 0]}>
        <torusGeometry args={[3.0, 0.003, 8, 200]} />
        <meshBasicMaterial color="#f4f4f5" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function ParticleField() {
  const ref = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const isMobile =
      typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
    const count = isMobile ? 140 : 320;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 5 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: "#f4f4f5",
      size: 0.02,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    });
    return { geometry, material };
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.03;
    }
  });

  return <points ref={ref} geometry={geometry} material={material} />;
}

export function BroadcastOrb() {
  const isMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  return (
    <Canvas
      camera={{ position: [0, 0, 6.5], fov: 45 }}
      dpr={isMobile ? [1, 1] : [1, 1.6]}
      gl={{ antialias: !isMobile, alpha: true, powerPreference: "low-power" }}
      style={{ background: "transparent" }}
    >
      <OrbContents />
      <ParticleField />
    </Canvas>
  );
}
