#version 300 es
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

    // Gentle animated gradient
    float angle = atan(p.y, p.x);
    float r = length(p);

    // Slow swirling gradient
    float swirl = sin(angle * 2.0 + t + r * 3.0) * 0.5 + 0.5;
    float wave = sin(r * 4.0 - t * 2.0) * 0.5 + 0.5;

    // Base colors — dark blue to purple
    vec3 c1 = vec3(0.05, 0.05, 0.15);
    vec3 c2 = vec3(0.12, 0.05, 0.2);
    vec3 c3 = vec3(0.08, 0.1, 0.25);

    vec3 col = mix(c1, c2, swirl);
    col = mix(col, c3, wave * 0.5);

    // Subtle audio reactivity
    col += vec3(0.03, 0.01, 0.05) * u_bass * u_intensity;
    col += vec3(0.02, 0.04, 0.03) * u_mid * u_intensity;
    col += vec3(0.04, 0.03, 0.02) * u_high * u_intensity * (sin(t * 8.0) * 0.5 + 0.5);

    // Soft center glow
    float glow = exp(-r * 1.5) * 0.15;
    col += vec3(0.1, 0.05, 0.15) * glow * (1.0 + u_beat * u_intensity * 0.5);

    // Vignette
    col *= 1.0 - r * 0.3;

    fragColor = vec4(col, 1.0);
}
