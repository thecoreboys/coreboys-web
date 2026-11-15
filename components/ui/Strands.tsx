"use client";

import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";
import "./Strands.css";

const MAX_STRANDS = 8;
const MAX_COLORS = 8;

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;
uniform float uAudioLevel;
out vec4 fragColor;
const float PI = 3.14159265;
vec3 samplePalette(float t) {
  float scaled = fract(t) * float(uColorCount);
  int index = int(floor(scaled));
  float blend = fract(scaled);
  int nextIndex = index + 1;
  if (nextIndex >= uColorCount) nextIndex = 0;
  return mix(uColors[index], uColors[nextIndex], blend);
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  uv /= max(uScale, 0.0001);
  float energy = 0.06 + uIntensity * 0.94;
  float audioEnergy = clamp(uAudioLevel, 0.0, 1.0);
  float envelope = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);
  vec3 color = vec3(0.0);
  float pixel = 1.0 / (uResolution.y * max(uScale, 0.0001));
  for (int i = 0; i < ${MAX_STRANDS}; i++) {
    if (i >= uStrandCount) break;
    float strand = float(i);
    float phase = strand * 1.7 * uSpread;
    float frequency = (2.0 + strand * 0.35) * uWaviness;
    float speed = 1.0 + strand * 0.18;
    float time = uTime;
    float wave = sin(uv.x * frequency + time * speed + phase) * 0.60
      + sin(uv.x * frequency * 1.1 - time * speed * 0.7 + phase * 1.7) * 0.40;
    float y = wave * (0.1 + 0.02 * energy) * envelope * uAmplitude * (0.72 + audioEnergy * 1.8);
    // A fine illuminated trace, with a small falloff like phosphor on glass.
    // Keep the core a consistent physical width as the voice gets louder.
    float width = pixel * max(0.55, uThickness);
    float distance = abs(uv.y - y);
    float trace = 1.0 - smoothstep(width, width + pixel, distance);
    float halo = exp(-distance / (width * 3.0)) * 0.16 * uGlow;
    color += samplePalette(strand / float(uStrandCount)) * (trace + halo) * envelope;
  }
  color *= 0.45 + 0.7 * energy;
  color = 1.0 - exp(-color);
  float grayscale = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = max(mix(vec3(grayscale), color, uSaturation), 0.0);
  float alpha = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0) * uOpacity;
  fragColor = vec4(color * uOpacity, alpha);
}
`;

type StrandsProps = {
  colors?: string[];
  count?: number;
  speed?: number;
  amplitude?: number;
  waviness?: number;
  thickness?: number;
  glow?: number;
  taper?: number;
  spread?: number;
  intensity?: number;
  saturation?: number;
  opacity?: number;
  scale?: number;
  audioLevel?: number;
  className?: string;
};

function palette(colors: string[]) {
  const filled = colors.length ? colors : ["#ffffff"];
  return Array.from({ length: MAX_COLORS }, (_, index) => {
    const color = new Color(filled[index] ?? filled[filled.length - 1]);
    return [color.r, color.g, color.b];
  });
}

/** Lightweight WebGL signal used as a voice-reactive visual, never as UI text. */
export function Strands({
  colors = ["#f43f5e", "#f97316", "#22d3ee"],
  count = 3,
  speed = 0.5,
  amplitude = 1,
  waviness = 1.7,
  thickness = 0.7,
  glow = 2.6,
  taper = 3,
  spread = 1,
  intensity = 0.6,
  saturation = 1.5,
  opacity = 1,
  scale = 1.5,
  audioLevel = 0,
  className = "",
}: StrandsProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ colors, count, speed, amplitude, waviness, thickness, glow, taper, spread, intensity, saturation, opacity, scale, audioLevel });
  propsRef.current = { colors, count, speed, amplitude, waviness, thickness, glow, taper, spread, intensity, saturation, opacity, scale, audioLevel };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Initialize once from the same ref the animation reads on every frame.
    // Changing audio or appearance should update uniforms, not recreate WebGL.
    const initial = propsRef.current;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    } catch {
      return; // The CSS trace remains visible when WebGL is unavailable.
    }
    const gl = renderer.gl;
    if (!renderer.isWebgl2) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uResolution: { value: [1, 1] }, uColors: { value: palette(initial.colors) },
        uColorCount: { value: Math.max(1, Math.min(initial.colors.length, MAX_COLORS)) }, uStrandCount: { value: Math.min(initial.count, MAX_STRANDS) },
        uAmplitude: { value: initial.amplitude }, uWaviness: { value: initial.waviness }, uThickness: { value: initial.thickness },
        uGlow: { value: initial.glow }, uTaper: { value: initial.taper }, uSpread: { value: initial.spread }, uIntensity: { value: initial.intensity },
        uOpacity: { value: initial.opacity }, uScale: { value: initial.scale }, uSaturation: { value: initial.saturation }, uAudioLevel: { value: initial.audioLevel },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    host.appendChild(gl.canvas);
    const resize = () => {
      const width = Math.max(1, host.offsetWidth);
      const height = Math.max(1, host.offsetHeight);
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    let visible = true;
    let previousTime = 0;
    let elapsed = 0;
    let smoothedAudio = 0;
    let paletteKey = initial.colors.join(",");
    let contextLost = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canAnimate = () => visible && !document.hidden && !motion.matches && !contextLost;
    const render = (time: number) => {
      frame = 0;
      if (!canAnimate()) return;
      const current = propsRef.current;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
      previousTime = time;
      // Integrate speed so voice-level changes cannot jump the trace's phase.
      elapsed += delta * current.speed;
      smoothedAudio += (current.audioLevel - smoothedAudio) * (1 - Math.exp(-delta * 12));
      program.uniforms.uTime.value = elapsed;
      const nextPaletteKey = current.colors.join(",");
      if (nextPaletteKey !== paletteKey) {
        program.uniforms.uColors.value = palette(current.colors);
        paletteKey = nextPaletteKey;
      }
      program.uniforms.uColorCount.value = Math.max(1, Math.min(current.colors.length, MAX_COLORS));
      program.uniforms.uStrandCount.value = Math.min(Math.max(Math.round(current.count), 1), MAX_STRANDS);
      program.uniforms.uAmplitude.value = current.amplitude;
      program.uniforms.uWaviness.value = current.waviness;
      program.uniforms.uThickness.value = current.thickness;
      program.uniforms.uGlow.value = current.glow;
      program.uniforms.uTaper.value = current.taper;
      program.uniforms.uSpread.value = current.spread;
      program.uniforms.uIntensity.value = current.intensity;
      program.uniforms.uOpacity.value = current.opacity;
      program.uniforms.uScale.value = current.scale;
      program.uniforms.uSaturation.value = current.saturation;
      program.uniforms.uAudioLevel.value = smoothedAudio;
      renderer.render({ scene: mesh });
      frame = requestAnimationFrame(render);
    };
    const syncAnimation = () => {
      cancelAnimationFrame(frame);
      previousTime = 0;
      frame = canAnimate() ? requestAnimationFrame(render) : 0;
    };
    const visibility = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      syncAnimation();
    });
    visibility.observe(host);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      syncAnimation();
      gl.canvas.style.opacity = "0";
    };
    gl.canvas.addEventListener("webglcontextlost", onContextLost);
    document.addEventListener("visibilitychange", syncAnimation);
    motion.addEventListener("change", syncAnimation);
    syncAnimation();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", syncAnimation);
      motion.removeEventListener("change", syncAnimation);
      gl.canvas.removeEventListener("webglcontextlost", onContextLost);
      geometry.remove();
      program.remove();
      if (gl.canvas.parentNode === host) host.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <div ref={hostRef} className={`strands-container ${className}`} aria-hidden />;
}
