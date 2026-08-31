"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./special-message.module.css";

type View = {
  yaw: number;
  pitch: number;
};

// The panorama is authored with the Atlantic horizon at yaw 0.
const INITIAL_VIEW: View = { yaw: 0, pitch: 0 };
const TURN_SENSITIVITY = 0.006;
const TILT_SENSITIVITY = 0.005;
const KEY_STEP = 0.16;
const MAX_PITCH = 1.2;

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function isLookingOceanward(view: View) {
  return Math.abs(normalizeAngle(view.yaw)) < 0.62;
}

function clampPitch(pitch: number) {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
}

export function PanoramaViewer() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const yawRef = useRef(INITIAL_VIEW.yaw);
  const pitchRef = useRef(INITIAL_VIEW.pitch);
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
  const [panoramaReady, setPanoramaReady] = useState(false);
  const isOceanView = isLookingOceanward(view);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    let disposed = false;
    let disposeRenderer: (() => void) | undefined;

    void import("three").then((THREE) => {
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
      const geometry = new THREE.SphereGeometry(40, 96, 64);
      const material = new THREE.MeshBasicMaterial({ color: 0x101820 });
      const panorama = new THREE.Mesh(geometry, material);
      const textureLoader = new THREE.TextureLoader();

      geometry.scale(-1, 1, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute("aria-hidden", "true");
      mount.appendChild(renderer.domElement);
      scene.add(panorama);

      const render = () => {
        const yaw = yawRef.current;
        const pitch = pitchRef.current;
        const horizontal = Math.cos(pitch);
        camera.lookAt(Math.cos(yaw) * horizontal, Math.sin(pitch), Math.sin(yaw) * horizontal);
        renderer.render(scene, camera);
      };

      const resize = () => {
        const { width, height } = mount.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
      };

      renderRef.current = render;
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      resize();

      textureLoader.load(
        "/special-message/evidence/drone-panorama.webp",
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }

          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          setPanoramaReady(true);
          render();
        },
        undefined,
        () => {
          // Leave the accessible CSS fallback in place if the source image cannot load.
          renderRef.current = null;
        },
      );

      disposeRenderer = () => {
        resizeObserver.disconnect();
        renderRef.current = null;
        material.map?.dispose();
        material.dispose();
        geometry.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      disposeRenderer?.();
    };
  }, []);

  function setViewpoint(next: View) {
    const normalizedYaw = normalizeAngle(next.yaw);
    const clampedPitch = clampPitch(next.pitch);
    yawRef.current = normalizedYaw;
    pitchRef.current = clampedPitch;
    setView({ yaw: normalizedYaw, pitch: clampedPitch });
    renderRef.current?.();
  }

  function setYaw(yaw: number) {
    setViewpoint({ yaw, pitch: view.pitch });
  }

  function resetView() {
    setViewpoint(INITIAL_VIEW);
  }

  function stopDragging() {
    dragRef.current.active = false;
    setDragging(false);
  }

  return (
    <figure className={styles.panoramaFigure}>
      <h3 className={styles.panoramaTitle}>Where I call home</h3>
      <div
        className={`${styles.panoramaViewport} ${dragging ? styles.panoramaDragging : ""}`}
        role="region"
        aria-label="Interactive 360 degree aerial panorama of South Florida"
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

          setViewpoint({
            yaw: drag.yaw - (event.clientX - drag.startX) * TURN_SENSITIVITY,
            pitch: drag.pitch + (event.clientY - drag.startY) * TILT_SENSITIVITY,
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
            nextView = { ...view, pitch: clampPitch(view.pitch + KEY_STEP) };
          } else if (event.key === "ArrowDown") {
            nextView = { ...view, pitch: clampPitch(view.pitch - KEY_STEP) };
          }

          if (!nextView) return;
          event.preventDefault();
          setYaw(nextView.yaw);
        }}
      >
        <div className={styles.panoramaFallback} aria-hidden="true" />
        <div ref={canvasMountRef} className={styles.panoramaCanvas} aria-hidden="true" />

        {!panoramaReady ? <div className={styles.panoramaLoading}>Loading 360° view</div> : null}

        <div
          className={`${styles.panoramaPlace} ${
            isOceanView ? styles.panoramaPlaceVisible : ""
          }`}
          aria-hidden="true"
        >
          <span>Atlantic coast</span>
          <strong>South Florida</strong>
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

        <span className={styles.panoramaHint}>Drag to look around and tilt up or down</span>
        <span id="panorama-instructions" className={styles.panoramaSrOnly}>
          Drag horizontally to look around and vertically to tilt up or down. Use the arrow keys,
          or Home or R, to reset to the ocean view.
        </span>
        <span id="panorama-status" className={styles.panoramaSrOnly} aria-live="polite">
          {isOceanView ? "Facing the Atlantic Ocean: South Florida." : "Looking around South Florida."}
        </span>
      </div>
      <figcaption>
        <span>Production file / FAA-registered drone flight</span>
        <div>
          <small>Source capture / 8,192 × 4,096 / 360° equirectangular panorama</small>
        </div>
      </figcaption>
    </figure>
  );
}
