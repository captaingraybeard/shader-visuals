# TASK.md — Build the MVP Tonight

## What We're Building
An audio-reactive shader visualizer as a PWA (installable on iPhone from Safari).

User types a **scene** ("underwater cathedral") and a **vibe** ("psychedelic chaos"), adjusts an **intensity** slider, and gets a full-screen WebGL shader that reacts to their music in real-time via microphone.

## Technical Decisions (FINAL)

### Stack
- **Vite** — fast dev server, production build, PWA plugin
- **TypeScript** — not optional
- **WebGL2** — fragment shaders, full screen quad
- **Web Audio API** — mic input via getUserMedia, AnalyserNode FFT
- **Anthropic Claude API** — generate GLSL from scene+vibe prompts (client-side fetch to API)
- **PWA** — service worker + manifest so it's installable on iOS Safari

### Audio Uniforms (every frame)
| Uniform | Source | Range |
|---------|--------|-------|
| `u_time` | elapsed seconds | 0→∞ |
| `u_bass` | FFT 20-250Hz energy | 0.0-1.0 |
| `u_mid` | FFT 250-2kHz energy | 0.0-1.0 |
| `u_high` | FFT 2k-16kHz energy | 0.0-1.0 |
| `u_beat` | bass energy spike vs rolling avg | 0.0-1.0 (decays) |
| `u_intensity` | user slider | 0.0-1.0 |
| `u_resolution` | canvas size | vec2 |

### LLM Shader Generation
- System prompt instructs Claude to output ONLY valid WebGL2 GLSL (version 300 es)
- Must use the uniforms listed above
- Scene → visual elements, Vibe → movement/color/reactivity style
- Intensity multiplies audio reactivity
- Response parsed for GLSL code block, compiled, hot-swapped
- On compile error: retry once with error message, then fall back to default shader
- API key entered by user in settings (stored in localStorage)

### UI
- **Full screen canvas** — shader fills viewport
- **Overlay UI** (tap to show/hide on mobile):
  - Scene text input
  - Vibe text input  
  - "Generate" button
  - Intensity slider
  - Audio source toggle (mic)
  - Settings gear (API key input)
- **Dark minimal aesthetic** — glass morphism overlay, doesn't distract from visuals
- **Mobile-first** — touch friendly, responsive

### PWA Requirements
- `manifest.json` with app name, icons, theme color, display: standalone
- Service worker for offline (cache the app shell, shaders work offline once generated)
- Apple-specific meta tags for iOS install (apple-mobile-web-app-capable, status-bar-style)
- 192x192 and 512x512 icons (generate simple gradient icons programmatically or use SVG)

### Shader Hot-Swap
- Compile new shader → if success, crossfade (render both, alpha blend over 0.5s)
- If compile fails → show error toast, keep current shader running
- Include 5 bundled preset shaders for instant demo without API key:
  1. "Cosmic Ocean" — blue/purple fluid sim, bass = waves
  2. "Neon Grid" — synthwave grid, beat = pulse
  3. "Forest Fire" — organic particles, mid = flame dance  
  4. "Crystal Cave" — geometric reflections, high = sparkle
  5. "Void" — minimal dark, intensity reveals layers

### Beat Detection Algorithm
```
rollingAvg = rollingAvg * 0.95 + currentBass * 0.05
if currentBass > rollingAvg * 1.5:
    beat = 1.0
beat *= 0.9  // decay each frame
```

## File Structure
```
shader-visuals/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── public/
│   ├── manifest.json
│   ├── icons/           # PWA icons
│   └── sw.js            # Service worker
├── src/
│   ├── main.ts          # Entry point
│   ├── app.ts           # Main orchestrator
│   ├── audio.ts         # Web Audio API + FFT + beat detection
│   ├── renderer.ts      # WebGL2 setup + shader compile + uniforms + crossfade
│   ├── llm.ts           # Claude API: scene+vibe → GLSL
│   ├── ui.ts            # Overlay controls, settings panel
│   ├── presets.ts       # 5 bundled shader presets
│   └── types.ts         # Shared types
├── shaders/
│   └── default.frag     # Fallback shader (used if everything fails)
└── TASK.md
```

## Definition of Done
- [ ] `npm run dev` serves the app locally
- [ ] `npm run build` produces deployable static files  
- [ ] App opens full screen on iPhone Safari
- [ ] "Add to Home Screen" works (PWA manifest + icons)
- [ ] Mic audio captured and FFT working (test: shader reacts to clapping)
- [ ] 5 preset shaders selectable without API key
- [ ] Scene + Vibe prompt → Claude generates working GLSL → hot-swapped in
- [ ] Intensity slider visibly changes audio reactivity
- [ ] Shader crossfade on swap (no black flash)
- [ ] Handles compile errors gracefully (toast + fallback)
- [ ] 60fps on iPhone (no jank)
- [ ] Looks good. Not a tech demo — something you'd actually show people.

## DO NOT
- Add a backend/server (client-side only, API calls direct to Anthropic)
- Use Three.js or any WebGL framework (raw WebGL2)
- Over-engineer (no state management library, no routing)
- Skip error handling
- Make it ugly
