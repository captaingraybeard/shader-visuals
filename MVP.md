# MVP — Audio-Reactive Shader Visuals

## Goal
Browser-based app: pick a scene + vibe → get a real-time music visualizer.

## MVP Scope (v0.1)
Strip it to the minimum that demonstrates the core loop:

### What's In
- **Web app** (HTML + JS, no build step)
- **WebGL2 canvas** rendering a fragment shader
- **Web Audio API** capturing mic/system audio → FFT → uniforms
- **LLM prompt → GLSL generation** (Claude API call)
- **3 user inputs**: Scene (text), Vibe (text), Intensity (slider)
- **Hot-swap shaders** on prompt change (hard cut first, crossfade later)
- **5 audio uniforms**: `u_bass`, `u_mid`, `u_high`, `u_beat`, `u_time`

### What's NOT in MVP
- 3D geometry / point clouds / gaussian splats (pure procedural GLSL first)
- Effects layer (lasers, strobes, particles)
- Camera control
- Apple TV app
- Persistent scenes / saving / sharing
- Multiple audio sources

## Architecture

```
[User Input]          [Audio Input]
  Scene + Vibe  ──→  LLM  ──→  GLSL fragment shader
  Intensity     ──→  uniform multiplier
                      [Mic/Loopback]
                          │
                     Web Audio API
                          │
                    FFT analyser node
                          │
                  ┌───────┴───────┐
                  u_bass  u_mid  u_high  u_beat  u_time
                  └───────┬───────┘
                          │
                     WebGL2 Canvas
                          │
                      [60fps output]
```

## File Structure
```
shader-visuals/
├── index.html          # Single page app
├── js/
│   ├── app.js          # Main orchestrator
│   ├── audio.js        # Web Audio API + FFT + beat detection
│   ├── renderer.js     # WebGL2 setup + shader compilation + uniforms
│   └── llm.js          # Claude API call: prompts → GLSL
├── shaders/
│   ├── default.frag    # Fallback shader
│   └── examples/       # Pre-generated shaders for instant demo
├── css/
│   └── style.css
├── MVP.md
└── README.md
```

## LLM Prompt Design
System prompt tells Claude to generate a single GLSL fragment shader that:
- Uses uniforms: `u_time`, `u_bass`, `u_mid`, `u_high`, `u_beat`, `u_intensity`
- `u_resolution` for screen size
- Outputs to `fragColor`
- Must be valid WebGL2 GLSL (version 300 es)
- Scene prompt → visual elements
- Vibe prompt → movement style, color palette, speed, reactivity mapping

## Audio Pipeline
1. `getUserMedia()` or `getDisplayMedia()` for audio capture
2. `AnalyserNode` with FFT size 2048
3. Split frequency bins into bass (20-250Hz), mid (250-2kHz), high (2k-16kHz)
4. Normalize each to 0.0-1.0
5. Beat detection: energy spike in bass band vs rolling average
6. Push uniforms every `requestAnimationFrame`

## Milestones
1. **Static shader renders** — WebGL canvas with hardcoded shader, no audio
2. **Audio uniforms working** — Shader reacts to mic input
3. **LLM generates shader** — Type prompt, get new shader
4. **Hot-swap** — Change prompt, new shader compiles and replaces
5. **Polish** — UI, error handling, example presets
