"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { coreFragment, coreVertex } from "./shaders/core.glsl";

/**
 * The CORE: a high-detail icosahedron displaced by a custom vertex shader.
 * Bespoke fragment shader paints the molten read; an outer transmission shell
 * is provided separately via <CoreShell>.
 *
 * Rotation: slow Y at 0.04 rad/s. X wobble lerps toward `mouseY` (passed via
 * uniform from the parent scene), giving the core a sense of attention.
 */
export function CoreObject({
  mouseY = 0,
}: {
  mouseY?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDisplace: { value: 0.16 },
      // Deep ember stops; CSS --core-glow projected into RGB.
      uEmberA: { value: new THREE.Color("#3a0a00") },
      uEmberB: { value: new THREE.Color("#6e1700") },
      uGlowA: { value: new THREE.Color("#ff6a00") },
      uGlowB: { value: new THREE.Color("#ff3a00") },
      uGlowC: { value: new THREE.Color("#ffb020") },
    }),
    [],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    mesh.rotation.y += delta * 0.04;
    // Lerp X tilt toward 0.18 * mouseY for the "attention" wobble.
    const targetX = mouseY * 0.18;
    mesh.rotation.x += (targetX - mesh.rotation.x) * 0.06;

    (mat.uniforms.uTime as { value: number }).value = state.clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef}>
      {/* Detail 4 = ~642 verts; cheap and gives smooth displacement. */}
      <icosahedronGeometry args={[1.05, 4]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={coreVertex}
        fragmentShader={coreFragment}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * The "molten under glass" effect — a slightly larger transparent shell that
 * picks up reflections of the core. Implemented with drei's
 * MeshTransmissionMaterial (chromaticAberration + roughness drives the look).
 *
 * Rendered separately from CoreObject so the inner shader stays small.
 */
export function CoreShell() {
  // Lazy import drei material via dynamic to avoid pulling its entire surface
  // into the cold path. (We keep it as a sibling component rather than nesting,
  // so React reconciles it cleanly each render.)
  return (
    <mesh>
      <icosahedronGeometry args={[1.22, 3]} />
      <meshPhysicalMaterial
        transparent
        transmission={0.85}
        thickness={0.6}
        roughness={0.18}
        ior={1.45}
        attenuationColor="#ff6a00"
        attenuationDistance={2.0}
        opacity={0.3}
        clearcoat={1}
        clearcoatRoughness={0.2}
        toneMapped={false}
      />
    </mesh>
  );
}
