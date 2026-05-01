"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { MEMBERS } from "@/lib/members";

/**
 * Six member-tinted nodes orbiting the core on prime-period elliptical paths
 * with slight inclinations. Prime periods → no two paths ever align.
 *
 * Each node:
 *   - icosphere with the member's accent as emissive color
 *   - drei <Trail> ribbon (30-frame fade) behind it
 *   - hover scales 1.4x; emits a `coreboys:hover-node` CustomEvent so the
 *     parent scene can flood the canvas with that accent and the HTML overlay
 *     can show a tooltip + member dialog
 */
export function OrbitNodes({
  onHover,
  onClick,
}: {
  onHover?: (slug: string | null, color: string | null) => void;
  onClick?: (slug: string) => void;
}) {
  const { clock } = useThree();
  const [hovered, setHovered] = useState<string | null>(null);

  const nodes = useMemo(() => {
    // Prime-period ellipses — periods scaled around 8s with prime offsets so
    // no two members visually sync.
    const primes = [3, 5, 7, 11, 13, 17];
    return MEMBERS.slice(0, 6).map((m, i) => ({
      slug: m.slug,
      color: m.accent,
      stageName: m.stageName,
      radiusX: 2.4 + (i % 3) * 0.28,
      radiusZ: 2.0 + ((i + 2) % 3) * 0.26,
      period: primes[i] ?? 7, // seconds — prime-numbered
      phase: (i / 6) * Math.PI * 2,
      tiltY: (i - 2.5) * 0.18,
      yWobble: (i + 1) % 3 === 0 ? 0.6 : 0.4,
    }));
  }, []);

  const refs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(() => {
    const t = clock.elapsedTime;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const mesh = refs.current[i];
      if (!mesh) continue;
      const angle = n.phase + (t / n.period) * Math.PI * 2;
      const x = Math.cos(angle) * n.radiusX;
      const z = Math.sin(angle) * n.radiusZ;
      const y = Math.sin(angle * 1.3 + n.tiltY) * n.yWobble;
      mesh.position.set(x, y, z);

      // Hover scale: lerp toward 1 or 1.4.
      const target = hovered === n.slug ? 1.4 : 1;
      const s = mesh.scale.x + (target - mesh.scale.x) * 0.18;
      mesh.scale.set(s, s, s);

      mesh.rotation.x = angle * 1.5;
      mesh.rotation.y = angle;
    }
  });

  const onPointerOver = (slug: string, color: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(slug);
    onHover?.(slug, color);
    document.body.style.cursor = "pointer";
  };
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(null);
    onHover?.(null, null);
    document.body.style.cursor = "";
  };
  const onClickHandler = (slug: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick?.(slug);
  };

  return (
    <group rotation={[0.18, 0, 0.05]}>
      {nodes.map((n, i) => (
        <Trail
          key={n.slug}
          width={0.06}
          length={3}
          decay={1}
          color={n.color}
          attenuation={(t) => t * t}
        >
          <mesh
            ref={(el) => {
              refs.current[i] = el;
            }}
            onPointerOver={onPointerOver(n.slug, n.color)}
            onPointerOut={onPointerOut}
            onClick={onClickHandler(n.slug)}
          >
            <icosahedronGeometry args={[0.09, 2]} />
            <meshStandardMaterial
              color={n.color}
              emissive={n.color}
              emissiveIntensity={hovered === n.slug ? 4 : 2.4}
              toneMapped={false}
            />
          </mesh>
        </Trail>
      ))}
    </group>
  );
}
