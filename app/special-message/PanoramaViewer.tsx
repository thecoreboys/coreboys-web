"use client";

import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SRGBColorSpace, TextureLoader } from "three";
import styles from "./special-message.module.css";

type View = {
  yaw: number;
  pitch: number;
};

const INITIAL_VIEW: View = { yaw: 0, pitch: -0.05 };
const TURN_SENSITIVITY = 0.006;
const LOOK_SENSITIVITY = 0.0045;
const KEY_STEP = 0.16;
const MAX_PITCH = 0.58;

function clampPitch(pitch: number) {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function isLookingOceanward(view: View) {
  return Math.abs(normalizeAngle(view.yaw)) < 0.62 && Math.abs(view.pitch) < 0.46;
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function PanoramaSphere({ view, onLoaded }: { view: View; onLoaded: () => void }) {
  const texture = useLoader(TextureLoader, "/special-message/evidence/drone-panorama.webp");
  const { camera } = useThree();

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    onLoaded();
  }, [onLoaded, texture]);

  useEffect(() => {
    camera.rotation.order = "YXZ";
    camera.rotation.set(view.pitch, view.yaw, 0);
  }, [camera, view.pitch, view.yaw]);

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[40, 96, 64]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function PanoramaViewer() {
  const dragRef = useRef({
    active: false,
    pointerId: 0,
    startX: 0,
    startY: 0,
    yaw: INITIAL_VIEW.yaw,
    pitch: INITIAL_VIEW.pitch,
  });
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(true);
  const isOceanView = isLookingOceanward(view);
  const onLoaded = useMemo(() => () => setLoaded(true), []);
  const fallbackOffset = `-${((normalizeAngle(view.yaw) + Math.PI) / (2 * Math.PI)) * 200}%`;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateRenderer = () => setUseFallback(!hasWebGL() || reducedMotion.matches);

    updateRenderer();
    reducedMotion.addEventListener("change", updateRenderer);
    return () => reducedMotion.removeEventListener("change", updateRenderer);
  }, []);

  function resetView() {
    setView(INITIAL_VIEW);
  }

  function stopDragging() {
    dragRef.current.active = false;
    setDragging(false);
  }

  return (
    <figure className={styles.panoramaFigure}>
      <div
        className={`${styles.panoramaViewport} ${dragging ? styles.panoramaDragging : ""}`}
        role="region"
        aria-label="Interactive 360 degree aerial panorama of Boca Raton"
        aria-describedby="panorama-instructions panorama-status"
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) {
            return;
          }

          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            active: true,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            yaw: view.yaw,
            pitch: view.pitch,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag.active || drag.pointerId !== event.pointerId) return;

          setView({
            yaw: normalizeAngle(drag.yaw - (event.clientX - drag.startX) * TURN_SENSITIVITY),
            pitch: clampPitch(drag.pitch + (event.clientY - drag.startY) * LOOK_SENSITIVITY),
          });
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onKeyDown={(event) => {
          let nextView: View | null = null;

          if (event.key === "Home" || event.key.toLowerCase() === "r") {
            nextView = INITIAL_VIEW;
          } else if (event.key === "ArrowLeft") {
            nextView = { ...view, yaw: normalizeAngle(view.yaw - KEY_STEP) };
          } else if (event.key === "ArrowRight") {
            nextView = { ...view, yaw: normalizeAngle(view.yaw + KEY_STEP) };
          } else if (event.key === "ArrowUp") {
            nextView = { ...view, pitch: clampPitch(view.pitch - KEY_STEP) };
          } else if (event.key === "ArrowDown") {
            nextView = { ...view, pitch: clampPitch(view.pitch + KEY_STEP) };
          }

          if (!nextView) return;
          event.preventDefault();
          setView(nextView);
        }}
      >
        {useFallback ? (
          <div className={styles.panoramaFallback} aria-hidden="true">
            <img
              src="/special-message/evidence/drone-panorama.webp"
              alt=""
              draggable={false}
              onLoad={onLoaded}
              style={{ "--panorama-fallback-offset": fallbackOffset } as CSSProperties}
            />
          </div>
        ) : (
          <Canvas
            className={styles.panoramaCanvas}
            camera={{ fov: 68, near: 0.1, far: 100, position: [0, 0, 0.1] }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
          >
            <Suspense fallback={null}>
              <PanoramaSphere view={view} onLoaded={onLoaded} />
            </Suspense>
          </Canvas>
        )}

        {!loaded ? <div className={styles.panoramaLoading}>Loading panorama</div> : null}

        <div
          className={`${styles.panoramaPlace} ${
            isOceanView ? styles.panoramaPlaceVisible : ""
          }`}
          aria-hidden="true"
        >
          <span>Atlantic coast</span>
          <strong>Boca Raton</strong>
        </div>

        <div className={styles.panoramaHud} aria-hidden="true">
          <span className={styles.panoramaCompass}>E</span>
          <span>360° field view</span>
        </div>

        <button
          className={styles.panoramaReset}
          type="button"
          onClick={resetView}
          aria-label="Reset panorama to the ocean view"
        >
          <span aria-hidden="true">↺</span>
          Ocean view
        </button>

        <span className={styles.panoramaHint}>Drag to look around</span>
        <span id="panorama-instructions" className={styles.panoramaSrOnly}>
          Drag to look around the panorama. Use the arrow keys to look around, or Home or R to reset
          to the ocean view.
        </span>
        <span id="panorama-status" className={styles.panoramaSrOnly} aria-live="polite">
          {isOceanView ? "Facing the Atlantic Ocean: Boca Raton." : "Looking around the panorama."}
        </span>
      </div>
      <figcaption>
        <span>Field note / exhibit 05-D / FAA-registered drone flight</span>
        <div>
          <p>
            An explorable aerial view over Boca Raton. Drag across the frame to look around, then reset
            to the Atlantic-facing view whenever you want to return to the coast.
          </p>
          <small>Source capture / 8,192 × 4,096 / 360° equirectangular panorama</small>
        </div>
      </figcaption>
    </figure>
  );
}
