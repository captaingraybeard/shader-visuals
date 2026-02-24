import { Preset } from './types';

export const presets: Preset[] = [
  {
    name: 'Cosmic Ocean',
    description: 'Blue/purple fluid simulation — bass drives wave amplitude',
    source: `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time * 0.3;
    float bass = u_bass * u_intensity;
    float mid = u_mid * u_intensity;

    // Layered ocean waves driven by bass
    float wave = 0.0;
    for (float i = 1.0; i < 6.0; i++) {
        float freq = i * 1.5;
        float amp = (0.5 / i) * (0.3 + bass * 0.7);
        wave += sin(p.x * freq + t * i * 0.4 + sin(t * 0.2 * i)) * amp;
        wave += cos(p.y * freq * 0.8 + t * i * 0.3) * amp * 0.5;
    }

    float depth = p.y + wave * 0.3;

    // Bioluminescent colors
    vec3 deep = vec3(0.02, 0.01, 0.08);
    vec3 mid_col = vec3(0.05, 0.1, 0.4);
    vec3 surface = vec3(0.1, 0.3, 0.7);
    vec3 glow = vec3(0.3, 0.1, 0.8);

    float zone = smoothstep(-1.0, 1.0, depth);
    vec3 col = mix(surface, deep, zone);
    col = mix(col, mid_col, smoothstep(0.3, 0.6, zone));

    // Bioluminescent particles
    float sparkle = 0.0;
    for (float i = 0.0; i < 8.0; i++) {
        vec2 sp = vec2(
            sin(i * 3.14 + t * 0.5) * 0.6,
            cos(i * 2.17 + t * 0.3) * 0.8 + wave * 0.2
        );
        float d = length(p - sp);
        sparkle += (0.003 + mid * 0.005) / (d + 0.01);
    }
    col += glow * sparkle * 0.3;

    // Beat flash
    col += vec3(0.1, 0.05, 0.3) * u_beat * u_intensity;

    // High frequency shimmer on surface
    float shimmer = sin(p.x * 30.0 + t * 5.0) * sin(p.y * 20.0 + t * 3.0);
    col += vec3(0.1, 0.2, 0.5) * shimmer * u_high * u_intensity * 0.2 * (1.0 - zone);

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: 'Neon Grid',
    description: 'Synthwave retro grid — beat pulses the grid lines',
    source: `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float beat = u_beat * u_intensity;
    float bass = u_bass * u_intensity;

    // Sky gradient
    vec3 col = mix(
        vec3(0.02, 0.0, 0.08),
        vec3(0.15, 0.0, 0.2),
        uv.y
    );

    // Sun
    float sunY = 0.3;
    float sunDist = length(vec2(p.x, p.y - sunY));
    vec3 sunCol = mix(vec3(1.0, 0.3, 0.6), vec3(1.0, 0.8, 0.2), uv.y);
    col += sunCol * smoothstep(0.35, 0.0, sunDist) * 0.8;
    // Sun horizontal lines
    float sunLines = step(0.0, sin(p.y * 40.0 + t * 2.0));
    col *= mix(1.0, sunLines * 0.5 + 0.5, smoothstep(0.35, 0.1, sunDist) * step(p.y, sunY));

    // Grid floor
    if (p.y < 0.0) {
        // Perspective projection
        float z = -0.5 / (p.y - 0.001);
        float x = p.x * z;
        float scroll = t * 2.0 + bass * 3.0;

        // Grid lines
        float gridX = abs(fract(x * 0.5) - 0.5);
        float gridZ = abs(fract(z * 0.3 + scroll * 0.3) - 0.5);

        float lineWidth = 0.02 + beat * 0.03;
        float lineX = smoothstep(lineWidth, 0.0, gridX);
        float lineZ = smoothstep(lineWidth, 0.0, gridZ);
        float grid = max(lineX, lineZ);

        // Grid glow color — pink/cyan
        vec3 gridCol = mix(
            vec3(0.0, 0.8, 1.0),
            vec3(1.0, 0.2, 0.8),
            sin(z * 0.5 + t) * 0.5 + 0.5
        );

        // Fade with distance
        float fog = exp(-z * 0.15);
        grid *= fog;

        // Beat pulse brightness
        float pulse = 1.0 + beat * 2.0;
        col += gridCol * grid * (0.5 + bass * 0.5) * pulse;

        // Horizon glow
        float horizonGlow = exp(-abs(p.y) * 8.0);
        col += vec3(1.0, 0.2, 0.6) * horizonGlow * 0.3;
    }

    // High-frequency stars
    float stars = 0.0;
    for (float i = 0.0; i < 20.0; i++) {
        vec2 starPos = vec2(
            fract(sin(i * 127.1) * 311.7) * 2.0 - 1.0,
            fract(sin(i * 269.5) * 183.3) * 0.8 + 0.2
        );
        starPos.x *= u_resolution.x / u_resolution.y;
        float d = length(p - starPos);
        float twinkle = sin(t * 3.0 + i * 5.0) * 0.5 + 0.5;
        stars += (0.001 + u_high * u_intensity * 0.002) / (d + 0.005) * twinkle;
    }
    col += vec3(0.8, 0.8, 1.0) * stars * 0.15;

    // Scanlines
    col *= 0.95 + 0.05 * sin(gl_FragCoord.y * 1.5);

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: 'Forest Fire',
    description: 'Organic fire particles — mid frequencies drive flame dance',
    source: `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

// Hash-based pseudo-noise
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float mid = u_mid * u_intensity;
    float bass = u_bass * u_intensity;
    float beat = u_beat * u_intensity;

    // Fire shape — rises from bottom
    vec2 fireUV = vec2(p.x * 0.8, p.y + 0.5);

    // Turbulent noise for flame
    float n1 = fbm(fireUV * 3.0 + vec2(0.0, -t * 1.5 - mid * 2.0));
    float n2 = fbm(fireUV * 5.0 + vec2(t * 0.3, -t * 2.0));
    float n3 = fbm(fireUV * 8.0 + vec2(-t * 0.5, -t * 3.0 - mid));

    float flame = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

    // Flame envelope — narrow at top, wide at bottom
    float envelope = smoothstep(1.2, -0.5, fireUV.y);
    envelope *= smoothstep(0.8 + bass * 0.3, 0.0, abs(fireUV.x));

    float intensity = flame * envelope;
    intensity = smoothstep(0.1, 0.9, intensity);

    // Boost with beat
    intensity += beat * 0.3 * envelope;

    // Fire color ramp
    vec3 col = vec3(0.0);
    col = mix(col, vec3(0.5, 0.0, 0.0), smoothstep(0.0, 0.2, intensity));      // dark red
    col = mix(col, vec3(0.9, 0.2, 0.0), smoothstep(0.2, 0.4, intensity));      // orange
    col = mix(col, vec3(1.0, 0.6, 0.0), smoothstep(0.4, 0.65, intensity));     // yellow-orange
    col = mix(col, vec3(1.0, 0.9, 0.4), smoothstep(0.65, 0.85, intensity));    // bright yellow
    col = mix(col, vec3(1.0, 1.0, 0.9), smoothstep(0.85, 1.0, intensity));     // white core

    // Ember particles
    float embers = 0.0;
    for (float i = 0.0; i < 15.0; i++) {
        float seed = hash(vec2(i, i * 0.7));
        vec2 ep = vec2(
            sin(seed * 20.0 + t * (0.3 + seed * 0.5)) * (0.3 + seed * 0.4),
            mod(seed * 5.0 + t * (0.5 + seed * 0.8), 3.0) - 1.0
        );
        float d = length(p - ep);
        float flicker = sin(t * 10.0 * seed) * 0.5 + 0.5;
        embers += (0.001 + mid * 0.002) / (d + 0.01) * flicker;
    }
    col += vec3(1.0, 0.4, 0.1) * embers * 0.2;

    // Ambient glow at the base
    col += vec3(0.3, 0.05, 0.0) * smoothstep(0.5, -0.8, p.y) * 0.3 * (0.5 + bass);

    // High sparkles
    float highSpark = noise(p * 20.0 + t * 5.0) * u_high * u_intensity;
    col += vec3(1.0, 0.8, 0.3) * highSpark * envelope * 0.3;

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: 'Crystal Cave',
    description: 'Geometric kaleidoscope reflections — high frequencies drive sparkle',
    source: `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float high = u_high * u_intensity;
    float bass = u_bass * u_intensity;
    float mid = u_mid * u_intensity;
    float beat = u_beat * u_intensity;

    // Polar coordinates
    float r = length(p);
    float a = atan(p.y, p.x);

    // Kaleidoscope — fold angle into segments
    float segments = 6.0 + beat * 2.0;
    float segAngle = 3.14159 * 2.0 / segments;
    a = mod(a, segAngle);
    a = abs(a - segAngle * 0.5);

    // Back to cartesian for crystal geometry
    vec2 cp = vec2(cos(a), sin(a)) * r;

    // Crystal facets — repeating triangular grid
    float scale = 3.0 + bass * 2.0;
    vec2 grid = cp * scale;
    vec2 gi = floor(grid);
    vec2 gf = fract(grid) - 0.5;

    // Facet distance
    float facet = min(min(
        abs(gf.x),
        abs(gf.y)),
        abs(gf.x + gf.y - 0.5) * 0.707
    );

    // Crystal edge glow
    float edge = smoothstep(0.05 + high * 0.03, 0.0, facet);

    // Prismatic color based on angle and position
    float hue = fract(a / 3.14159 + gi.x * 0.1 + gi.y * 0.13 + t * 0.1);
    float sat = 0.6 + high * 0.3;
    float val = 0.3 + edge * 0.7;

    vec3 col = hsv2rgb(vec3(hue, sat, val));

    // Inner glow — bright center
    float centerGlow = exp(-r * 2.0) * (0.5 + beat * 0.5);
    col += vec3(0.5, 0.3, 0.8) * centerGlow;

    // Sparkle on crystal facets driven by high frequencies
    float sparklePhase = sin(gi.x * 127.1 + gi.y * 311.7);
    float sparkle = pow(max(0.0, sin(sparklePhase * 20.0 + t * 8.0)), 20.0);
    col += vec3(1.0) * sparkle * high * 1.5;

    // Facet internal refraction colors
    vec3 refractCol = hsv2rgb(vec3(
        fract(hue + 0.3 + mid * 0.2),
        0.8,
        0.5 * (1.0 - edge)
    ));
    col = mix(col, refractCol, 0.3 * (1.0 - edge));

    // Pulsing brightness on beat
    col *= 1.0 + beat * 0.4;

    // Depth fade
    col *= smoothstep(2.0, 0.5, r);

    // Subtle rotation shimmer
    float shimmer = sin(a * segments * 2.0 + t * 3.0) * 0.5 + 0.5;
    col += vec3(0.2, 0.1, 0.3) * shimmer * high * 0.3;

    fragColor = vec4(col, 1.0);
}`,
  },
  {
    name: 'Void',
    description: 'Minimal dark shader — intensity reveals hidden layers',
    source: `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float intensity = u_intensity;

    // Base: near-black with very subtle gradient
    vec3 col = vec3(0.01, 0.01, 0.015) + uv.y * 0.01;

    // Layer 1 (intensity > 0.1): subtle dark breathing circle
    float r = length(p);
    float breath = sin(t * 0.5) * 0.02 * intensity;
    float ring = smoothstep(0.5 + breath, 0.48 + breath, r) * smoothstep(0.4, 0.45, r);
    col += vec3(0.03, 0.02, 0.05) * ring * smoothstep(0.0, 0.2, intensity);

    // Layer 2 (intensity > 0.3): dark ripples from center
    float ripple = sin(r * 20.0 - t * 2.0) * 0.5 + 0.5;
    ripple *= exp(-r * 3.0);
    col += vec3(0.05, 0.02, 0.08) * ripple * smoothstep(0.2, 0.4, intensity) * (0.5 + u_bass * 0.5);

    // Layer 3 (intensity > 0.5): particle dust orbiting
    float dust = 0.0;
    for (float i = 0.0; i < 12.0; i++) {
        float angle = i / 12.0 * 6.283 + t * (0.2 + hash(vec2(i)) * 0.3);
        float radius = 0.3 + sin(t * 0.3 + i) * 0.15;
        vec2 dp = vec2(cos(angle), sin(angle)) * radius;
        float d = length(p - dp);
        float glow = 0.002 / (d + 0.01);
        dust += glow * (0.5 + u_mid * 0.5);
    }
    col += vec3(0.1, 0.05, 0.15) * dust * smoothstep(0.4, 0.6, intensity);

    // Layer 4 (intensity > 0.7): fractal tendrils
    float tendril = 0.0;
    vec2 tp = p * 2.0;
    for (int i = 0; i < 5; i++) {
        tp = abs(tp) / dot(tp, tp) - 0.8;
        tp *= mat2(cos(t * 0.1), sin(t * 0.1), -sin(t * 0.1), cos(t * 0.1));
        tendril += exp(-length(tp) * 2.0);
    }
    tendril /= 5.0;
    vec3 tendrilCol = vec3(0.15, 0.05, 0.25) * tendril;
    col += tendrilCol * smoothstep(0.6, 0.8, intensity) * (0.7 + u_high * 0.3);

    // Layer 5 (intensity > 0.9): full reveal — bright energy core
    float core = exp(-r * 4.0);
    vec3 coreCol = mix(vec3(0.2, 0.0, 0.4), vec3(0.5, 0.1, 0.8), core);
    col += coreCol * core * smoothstep(0.8, 1.0, intensity) * (0.8 + u_beat * 0.5);

    // Beat — subtle dark flash
    col += vec3(0.02, 0.01, 0.03) * u_beat * intensity;

    // Keep it dark overall
    col = min(col, vec3(0.8));

    fragColor = vec4(col, 1.0);
}`,
  },
];
