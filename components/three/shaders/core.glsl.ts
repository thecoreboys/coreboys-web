/**
 * Bespoke shaders for the CORE mesh.
 *
 * Vertex: high-detail icosahedron displaced by 3D simplex noise. Two octaves,
 *   slow time-driven offset.
 * Fragment: deep ember base, fresnel rim using --core-glow, procedural
 *   emissive flicker, subtle thin-film iridescence at grazing angles.
 *
 * The shaders are kept as plain template strings so they survive bundling
 * without any plugin gymnastics. Embedded GLSL noise is ashima/webgl-noise
 * (MIT) — small enough to inline.
 */

const SIMPLEX_3D = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const coreVertex = /* glsl */ `
uniform float uTime;
uniform float uDisplace;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying float vNoise;

${SIMPLEX_3D}

void main() {
  // Two octaves of 3D simplex.
  float n1 = snoise(position * 0.85 + vec3(0.0, uTime * 0.18, 0.0));
  float n2 = snoise(position * 1.9 + vec3(uTime * 0.11, 0.0, uTime * 0.07));
  float n = n1 * 0.7 + n2 * 0.3;
  vNoise = n;

  vec3 displaced = position + normal * n * uDisplace;

  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const coreFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uEmberA;
uniform vec3 uEmberB;
uniform vec3 uGlowA;
uniform vec3 uGlowB;
uniform vec3 uGlowC;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying float vNoise;

void main() {
  // Fresnel — bright at grazing angles.
  float fresnel = pow(1.0 - clamp(dot(normalize(vWorldNormal), normalize(vViewDir)), 0.0, 1.0), 2.6);

  // Base ember — interpolate two deep oranges by noise.
  vec3 base = mix(uEmberA, uEmberB, smoothstep(-0.4, 0.4, vNoise));

  // Fresnel rim picks color from the --core-glow gradient (3-stop).
  float t = clamp(fresnel, 0.0, 1.0);
  vec3 rim = mix(mix(uGlowA, uGlowB, smoothstep(0.0, 0.5, t)),
                 uGlowC, smoothstep(0.5, 1.0, t));

  // Procedural emissive flicker — 0.3Hz envelope, gated by displacement noise.
  float flicker = 0.6 + 0.4 * sin(uTime * 1.8 + vNoise * 6.0);
  vec3 emissive = rim * fresnel * flicker;

  // Subtle thin-film iridescence at grazing angles only.
  float iri = pow(fresnel, 5.0);
  vec3 thinFilm = vec3(
    0.5 + 0.5 * sin(iri * 12.0 + uTime * 0.7),
    0.5 + 0.5 * sin(iri * 17.0 + uTime * 0.7 + 2.094),
    0.5 + 0.5 * sin(iri * 23.0 + uTime * 0.7 + 4.188)
  ) * iri * 0.18;

  vec3 color = base + emissive + thinFilm;
  gl_FragColor = vec4(color, 1.0);
}
`;
