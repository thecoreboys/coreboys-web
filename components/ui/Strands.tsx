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
uniform float uSpeed;
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
  float envelope = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);
  vec3 color = vec3(0.0);
  for (int i = 0; i < ${MAX_STRANDS}; i++) {
    if (i >= uStrandCount) break;
    float strand = float(i);
    float phase = strand * 1.7 * uSpread;
    float frequency = (2.0 + strand * 0.35) * uWaviness;
    float speed = 1.4 + strand * 1.2;
    float time = uTime * uSpeed;
    float wave = sin(uv.x * frequency + time * speed + phase) * 0.60
      + sin(uv.x * frequency * 1.1 - time * speed * 0.7 + phase * 1.7) * 0.40;
    float y = wave * (0.1 + 0.02 * energy) * envelope * uAmplitude;
    float width = (0.001 + 0.05 * energy) * (0.35 + envelope) * uThickness;
    float glow = width / (abs(uv.y - y) + width * 0.45);
    color += samplePalette(strand / float(uStrandCount) + uv.x * 0.3 + uTime * 0.04) * glow * glow * envelope;
  }
  color *= 0.45 + 0.7 * energy;
  color = 1.0 - exp(-color * uGlow);
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
  className = "",
}: StrandsProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ colors, count, speed, amplitude, waviness, thickness, glow, taper, spread, intensity, saturation, opacity, scale });
  propsRef.current = { colors, count, speed, amplitude, waviness, thickness, glow, taper, spread, intensity, saturation, opacity, scale };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 }, uResolution: { value: [1, 1] }, uColors: { value: palette(colors) },
        uColorCount: { value: Math.min(colors.length, MAX_COLORS) }, uStrandCount: { value: Math.min(count, MAX_STRANDS) },
        uSpeed: { value: speed }, uAmplitude: { value: amplitude }, uWaviness: { value: waviness }, uThickness: { value: thickness },
        uGlow: { value: glow }, uTaper: { value: taper }, uSpread: { value: spread }, uIntensity: { value: intensity },
        uOpacity: { value: opacity }, uScale: { value: scale }, uSaturation: { value: saturation },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    host.appendChild(gl.canvas);
    const resize = () => {
      const width = Math.max(1, host.offsetWidth);
      const height = Math.max(1, host.offsetHeight);
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const render = (time: number) => {
      const current = propsRef.current;
      program.uniforms.uTime.value = time * 0.001;
      program.uniforms.uColors.value = palette(current.colors);
      program.uniforms.uColorCount.value = Math.min(current.colors.length, MAX_COLORS);
      program.uniforms.uStrandCount.value = Math.min(Math.max(Math.round(current.count), 1), MAX_STRANDS);
      program.uniforms.uSpeed.value = current.speed;
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
      renderer.render({ scene: mesh });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (gl.canvas.parentNode === host) host.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <div ref={hostRef} className={`strands-container ${className}`} aria-hidden />;
}
