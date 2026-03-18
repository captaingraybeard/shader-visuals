// Particle Style Switcher — multiple rendering modes for point cloud
// Each style provides GLSL fragment/vertex modifications switchable at runtime
// Styles: Default, Glass, Ink, Smoke, Sparks, Paint

import { addControl, controls } from './control-registry';

// ── Style definitions ──

export interface ParticleStyle {
  name: string;
  index: number;
  description: string;
  mobileCompatible: boolean;
}

const STYLES: ParticleStyle[] = [
  { name: 'Default', index: 0, description: 'Coherence-based circle/square morphing', mobileCompatible: true },
  { name: 'Glass', index: 1, description: 'Refractive, environment-mapped', mobileCompatible: true },
  { name: 'Ink', index: 2, description: 'Bleed/spread simulation', mobileCompatible: true },
  { name: 'Smoke', index: 3, description: 'Soft, volumetric', mobileCompatible: true },
  { name: 'Sparks', index: 4, description: 'Bright trails', mobileCompatible: true },
  { name: 'Paint', index: 5, description: 'Thick impasto strokes', mobileCompatible: true },
];

// ── Register style control ──

addControl('particleStyle', 0, 0, 5, 1, 'Particle Style', 'Style');

// ── Style registry ──

export class StyleRegistry {
  private styles: ParticleStyle[] = [...STYLES];

  getStyles(): ParticleStyle[] {
    return this.styles;
  }

  getActiveIndex(): number {
    return Math.round(controls.get('particleStyle', 0));
  }

  getActiveStyle(): ParticleStyle {
    const idx = this.getActiveIndex();
    return this.styles[idx] || this.styles[0];
  }

  setStyle(index: number): void {
    controls.set('particleStyle', Math.max(0, Math.min(this.styles.length - 1, index)));
  }
}

// Singleton
let _registry: StyleRegistry | null = null;
export function getStyleRegistry(): StyleRegistry {
  if (!_registry) _registry = new StyleRegistry();
  return _registry;
}

// ── GLSL: Fragment shader style functions (desktop, full quality) ──

export const STYLE_FRAG_FUNCTIONS = /* glsl */ `
// ── Hash for procedural noise in fragment shader ──
float styleHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float styleNoise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = styleHash(i);
  float b = styleHash(i + vec2(1.0, 0.0));
  float c = styleHash(i + vec2(0.0, 1.0));
  float d = styleHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// ── Style 0: Default ──
vec4 styleDefault(vec2 pc, float dist, vec3 color, float alpha, float coherence) {
  if (coherence < 0.7) {
    float shapeThreshold = mix(0.45, 0.7, coherence / 0.7);
    if (dist > shapeThreshold) discard;
    float edgeStart = shapeThreshold - 0.15;
    float edge = 1.0 - smoothstep(edgeStart, shapeThreshold, dist);
    return vec4(color * edge, alpha * edge);
  } else {
    return vec4(color, alpha);
  }
}

// ── Style 1: Glass (refractive, environment-mapped) ──
vec4 styleGlass(vec2 pc, float dist, vec3 color, float alpha, float coherence, float time, vec3 worldPos) {
  if (dist > 0.5) discard;

  // Fresnel-like rim glow
  float rim = smoothstep(0.15, 0.5, dist);
  float fresnel = pow(rim, 2.0);

  // Chromatic aberration — offset R/G/B channels radially
  vec2 dir = normalize(pc + 0.001);
  float aberration = 0.04 + fresnel * 0.06;
  float r = smoothstep(0.52, 0.2, length(pc + dir * aberration));
  float g = smoothstep(0.52, 0.2, length(pc));
  float b = smoothstep(0.52, 0.2, length(pc - dir * aberration));
  vec3 refractColor = vec3(r, g, b);

  // Environment mapping — fake matcap from world position
  vec2 envUV = normalize(worldPos.xy + 0.001) * 0.5 + 0.5;
  float envNoise = styleNoise2D(envUV * 4.0 + time * 0.3);
  vec3 envColor = mix(
    vec3(0.1, 0.15, 0.3),  // cool sky
    vec3(0.3, 0.25, 0.15), // warm ground
    envNoise
  );

  // Combine: base color through refraction + environment reflection + rim
  vec3 baseThrough = color * refractColor * 0.6;
  vec3 envReflect = envColor * fresnel * 0.5;
  vec3 rimGlow = (color + vec3(0.3)) * fresnel * 0.4;

  vec3 final = baseThrough + envReflect + rimGlow;

  // Specular highlight
  float spec = pow(max(0.0, 1.0 - dist * 3.0), 8.0);
  final += vec3(0.8, 0.85, 1.0) * spec * 0.6;

  // Glass edge softness
  float edgeAlpha = smoothstep(0.5, 0.35, dist);
  return vec4(final, alpha * edgeAlpha);
}

// ── Style 2: Ink (bleed/spread simulation) ──
vec4 styleInk(vec2 pc, float dist, vec3 color, float alpha, float coherence, float time) {
  // Organic noise-based edge for ink bleed
  float angle = atan(pc.y, pc.x);
  float noiseFreq = 8.0;
  float edgeNoise = styleNoise2D(vec2(angle * noiseFreq / 6.283, dist * 5.0) + time * 0.2);
  float bleedEdge = 0.45 + edgeNoise * 0.15 - coherence * 0.05;

  if (dist > bleedEdge + 0.05) discard;

  // Ink density — darker at edges (pooling effect)
  float inkDensity = smoothstep(bleedEdge + 0.05, bleedEdge - 0.15, dist);

  // Ink color: desaturate slightly, darken edges
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 inkBase = mix(vec3(luminance * 0.4), color * 0.7, 0.6);

  // Edge darkening — ink pools at boundaries
  float edgeDarken = smoothstep(0.1, bleedEdge, dist);
  inkBase *= 1.0 - edgeDarken * 0.4;

  // Subtle bleed tendrils
  float tendril = styleNoise2D(pc * 20.0 + color.xy * 5.0);
  inkBase += vec3(0.02) * tendril * (1.0 - inkDensity);

  // Paper texture (subtle grain)
  float grain = styleHash(gl_PointCoord * 50.0) * 0.08;
  inkBase += grain - 0.04;

  return vec4(inkBase, alpha * inkDensity);
}

// ── Style 3: Smoke (soft, volumetric) ──
vec4 styleSmoke(vec2 pc, float dist, vec3 color, float alpha, float coherence, float time) {
  // Gaussian density falloff
  float sigma = 0.2 + (1.0 - coherence) * 0.1;
  float density = exp(-(dist * dist) / (2.0 * sigma * sigma));

  // Animated wisp distortion
  float wispX = styleNoise2D(vec2(pc.x * 6.0, pc.y * 6.0 + time * 0.5)) - 0.5;
  float wispY = styleNoise2D(vec2(pc.y * 6.0, pc.x * 6.0 - time * 0.4)) - 0.5;
  vec2 distorted = pc + vec2(wispX, wispY) * 0.08;
  float distortedDist = length(distorted);
  float wispDensity = exp(-(distortedDist * distortedDist) / (2.0 * sigma * sigma));

  density = mix(density, wispDensity, 0.5);

  // Desaturate and lighten for smoke
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 smokeColor = mix(vec3(lum), color, 0.25);
  smokeColor = mix(smokeColor, vec3(0.6, 0.6, 0.65), 0.3);

  // Inner glow (hotter near center)
  float innerGlow = exp(-dist * dist * 8.0);
  smokeColor = mix(smokeColor, color * 1.2, innerGlow * 0.4);

  // Volumetric layering alpha
  float smokeAlpha = density * 0.7;

  return vec4(smokeColor, alpha * smokeAlpha);
}

// ── Style 4: Sparks (bright trails) ──
vec4 styleSparks(vec2 pc, float dist, vec3 color, float alpha, float coherence, float energy) {
  // Bright hot core
  float core = exp(-dist * dist * 32.0);

  // Elongated trail (vertical stretch for motion feel)
  float trailX = exp(-pc.x * pc.x * 80.0);
  float trailY = exp(-pc.y * pc.y * 12.0);
  float trail = trailX * trailY;

  // Cross-shaped flare
  float flareH = exp(-abs(pc.y) * 20.0) * exp(-abs(pc.x) * 6.0);
  float flareV = exp(-abs(pc.x) * 20.0) * exp(-abs(pc.y) * 6.0);
  float flare = (flareH + flareV) * 0.3;

  float brightness = max(core, max(trail * 0.6, flare));
  if (brightness < 0.01) discard;

  // Hot color gradient: white core → color → dim
  vec3 hotColor = vec3(1.0, 0.95, 0.8); // white-hot
  vec3 warmColor = color * 2.0 + vec3(0.3, 0.15, 0.0); // boosted warm
  vec3 sparkColor = mix(warmColor, hotColor, core);

  // Energy-based intensity boost
  float energyBoost = 1.0 + energy * 2.0;
  sparkColor *= energyBoost;

  // HDR bloom feel
  sparkColor *= 1.0 + core * 1.5;

  return vec4(sparkColor * brightness, alpha * brightness);
}

// ── Style 5: Paint (thick impasto strokes) ──
vec4 stylePaint(vec2 pc, float dist, vec3 color, float alpha, float coherence, float time) {
  // Rectangular brush stroke shape
  vec2 absPC = abs(pc);

  // Noise-based stroke angle rotation per point
  float angle = styleHash(floor(color.xy * 100.0)) * 3.14159;
  float ca = cos(angle), sa = sin(angle);
  vec2 rotPC = vec2(pc.x * ca - pc.y * sa, pc.x * sa + pc.y * ca);
  vec2 absRot = abs(rotPC);

  // Brush shape: rounded rectangle with rough edges
  float brushW = 0.45;
  float brushH = 0.25 + styleHash(color.yz * 50.0) * 0.15;
  float edgeNoise = styleNoise2D(rotPC * 12.0 + time * 0.1) * 0.08;
  float brush = smoothstep(brushW + edgeNoise, brushW - 0.05 + edgeNoise, absRot.x)
              * smoothstep(brushH + edgeNoise, brushH - 0.05 + edgeNoise, absRot.y);

  if (brush < 0.01) discard;

  // Impasto texture — raised ridges
  float ridge = styleNoise2D(rotPC * 25.0);
  float ridgeFine = styleNoise2D(rotPC * 50.0);
  float impasto = ridge * 0.6 + ridgeFine * 0.4;

  // Color variation across the stroke (paint mixing)
  float colorVar = styleNoise2D(rotPC * 8.0 + color.xy * 3.0);
  vec3 paintColor = color;
  paintColor *= 0.85 + colorVar * 0.3;  // value variation
  paintColor = mix(paintColor, paintColor.gbr * 0.8, (colorVar - 0.5) * 0.15); // slight hue shift

  // Lighting from impasto relief (fake directional light)
  float lightDir = impasto - styleNoise2D(rotPC * 25.0 + vec2(0.05, 0.02));
  paintColor += vec3(0.15) * lightDir; // highlights on ridges
  paintColor -= vec3(0.05) * (1.0 - impasto); // shadows in valleys

  // Thicker alpha near center
  float strokeAlpha = brush * (0.85 + impasto * 0.15);

  return vec4(paintColor, alpha * strokeAlpha);
}
`;

// ── GLSL: Vertex shader additions (extra varyings for styles) ──

export const STYLE_VERT_OUTPUTS = /* glsl */ `
// Style system varyings
out vec3 v_worldPos;
out float v_energy;
flat out float v_styleTime;
`;

export const STYLE_VERT_MAIN = /* glsl */ `
  // Style outputs
  v_worldPos = pos;
  v_energy = energy;
  v_styleTime = u_time;

  // Style-specific point size adjustments
  int styleIdx = int(u_particleStyle + 0.5);
  if (styleIdx == 2) {
    // Ink: slightly larger for bleed effect
    gl_PointSize *= 1.3;
  } else if (styleIdx == 3) {
    // Smoke: much larger, softer particles
    gl_PointSize *= 2.0;
  } else if (styleIdx == 4) {
    // Sparks: elongated, larger
    gl_PointSize *= 1.5 + energy * 1.5;
  } else if (styleIdx == 5) {
    // Paint: larger brush strokes
    gl_PointSize *= 1.6;
  }
`;

// ── GLSL: Fragment shader inputs matching vertex outputs ──

export const STYLE_FRAG_INPUTS = /* glsl */ `
// Style system inputs
in vec3 v_worldPos;
in float v_energy;
flat in float v_styleTime;
`;

// ── GLSL: Fragment main replacement using styles ──

export const STYLE_FRAG_MAIN = /* glsl */ `
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float dist = length(pc);

  int style = int(u_particleStyle + 0.5);

  if (style == 1) {
    fragColor = styleGlass(pc, dist, v_color, v_alpha, v_coherence, v_styleTime, v_worldPos);
  } else if (style == 2) {
    fragColor = styleInk(pc, dist, v_color, v_alpha, v_coherence, v_styleTime);
  } else if (style == 3) {
    fragColor = styleSmoke(pc, dist, v_color, v_alpha, v_coherence, v_styleTime);
  } else if (style == 4) {
    fragColor = styleSparks(pc, dist, v_color, v_alpha, v_coherence, v_energy);
  } else if (style == 5) {
    fragColor = stylePaint(pc, dist, v_color, v_alpha, v_coherence, v_styleTime);
  } else {
    fragColor = styleDefault(pc, dist, v_color, v_alpha, v_coherence);
  }
}
`;

// ── GLSL: Mobile-friendly simplified style functions ──

export const STYLE_FRAG_FUNCTIONS_MOBILE = /* glsl */ `
float styleHashMobile(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Mobile style 0: Default (simple circle)
vec4 mStyleDefault(vec2 pc, float dist, vec3 color, float alpha) {
  if (dist > 0.5) discard;
  float edge = 1.0 - smoothstep(0.35, 0.5, dist);
  return vec4(color * edge, alpha * edge);
}

// Mobile style 1: Glass (simple rim glow, no chromatic aberration)
vec4 mStyleGlass(vec2 pc, float dist, vec3 color, float alpha) {
  if (dist > 0.5) discard;
  float rim = smoothstep(0.15, 0.5, dist);
  float fresnel = rim * rim;
  vec3 glassColor = color * (1.0 - fresnel * 0.3) + vec3(0.2, 0.25, 0.35) * fresnel;
  float spec = pow(max(0.0, 1.0 - dist * 3.0), 6.0) * 0.4;
  glassColor += vec3(spec);
  float edgeAlpha = smoothstep(0.5, 0.35, dist);
  return vec4(glassColor, alpha * edgeAlpha);
}

// Mobile style 2: Ink (soft circle with darker edges)
vec4 mStyleInk(vec2 pc, float dist, vec3 color, float alpha) {
  if (dist > 0.5) discard;
  float ink = smoothstep(0.5, 0.15, dist);
  float lum = dot(color, vec3(0.3, 0.59, 0.11));
  vec3 inkColor = mix(vec3(lum * 0.4), color * 0.7, 0.6);
  inkColor *= 1.0 - dist * 0.3;
  return vec4(inkColor, alpha * ink);
}

// Mobile style 3: Smoke (gaussian, desaturated)
vec4 mStyleSmoke(vec2 pc, float dist, vec3 color, float alpha) {
  float density = exp(-dist * dist * 8.0);
  if (density < 0.02) discard;
  float lum = dot(color, vec3(0.3, 0.59, 0.11));
  vec3 smokeCol = mix(vec3(lum), color, 0.25);
  smokeCol = mix(smokeCol, vec3(0.55), 0.3);
  return vec4(smokeCol, alpha * density * 0.6);
}

// Mobile style 4: Sparks (bright core)
vec4 mStyleSparks(vec2 pc, float dist, vec3 color, float alpha) {
  float core = exp(-dist * dist * 24.0);
  if (core < 0.01) discard;
  vec3 sparkCol = mix(color * 1.5, vec3(1.0, 0.95, 0.8), core);
  return vec4(sparkCol * core, alpha * core);
}

// Mobile style 5: Paint (rectangular brush)
vec4 mStylePaint(vec2 pc, float dist, vec3 color, float alpha) {
  vec2 a = abs(pc);
  float brush = smoothstep(0.48, 0.4, a.x) * smoothstep(0.38, 0.28, a.y);
  if (brush < 0.01) discard;
  float grain = styleHashMobile(gl_PointCoord * 30.0) * 0.15;
  vec3 paintCol = color * (0.9 + grain);
  return vec4(paintCol, alpha * brush);
}
`;

export const STYLE_FRAG_MAIN_MOBILE = /* glsl */ `
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float dist = length(pc);

  int style = int(u_particleStyle + 0.5);

  if (style == 1) {
    fragColor = mStyleGlass(pc, dist, v_color, v_alpha);
  } else if (style == 2) {
    fragColor = mStyleInk(pc, dist, v_color, v_alpha);
  } else if (style == 3) {
    fragColor = mStyleSmoke(pc, dist, v_color, v_alpha);
  } else if (style == 4) {
    fragColor = mStyleSparks(pc, dist, v_color, v_alpha);
  } else if (style == 5) {
    fragColor = mStylePaint(pc, dist, v_color, v_alpha);
  } else {
    fragColor = mStyleDefault(pc, dist, v_color, v_alpha);
  }
}
`;

// ── Mobile vertex additions (minimal) ──

export const STYLE_VERT_MAIN_MOBILE = /* glsl */ `
  // Style-specific point size adjustments (mobile)
  int styleIdx = int(u_particleStyle + 0.5);
  if (styleIdx == 3) {
    gl_PointSize *= 1.6; // Smoke: larger
  } else if (styleIdx == 4) {
    gl_PointSize *= 1.3; // Sparks: slightly larger
  } else if (styleIdx == 5) {
    gl_PointSize *= 1.4; // Paint: larger
  }
`;
