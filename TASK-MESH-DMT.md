# TASK: Textured Depth Mesh + DMT Visuals + Autonomous Camera

## Context
This is a WebGL2 audio-reactive visual engine (PWA). Currently renders DALL-E generated images as 3D point clouds using depth estimation. We need to evolve it into an immersive fly-through experience.

**Repo**: `~/Developer/shader-visuals/`
**Stack**: Vite + TypeScript, raw WebGL2 (NO Three.js), Web Audio API
**Target**: iPhone Safari PWA (must work on mobile)
**Key files**:
- `src/app.ts` — main orchestrator, render loop
- `src/renderer-points.ts` — current point cloud WebGL2 renderer
- `src/pointcloud.ts` — image + depth → point cloud data
- `src/depth.ts` — depth estimation via @xenova/transformers
- `src/camera.ts` — current orbit camera
- `src/audio.ts` — mic/file audio input with FFT
- `src/imagegen.ts` — DALL-E 3 image generation
- `src/ui.ts` — glassmorphism UI overlay
- `src/renderer.ts` — old flat GLSL shader renderer (reference only)

## What to Build

### 1. Textured Depth Mesh Renderer (`src/renderer-mesh.ts`)
- New renderer that builds a **triangle mesh grid** from the depth map
- Each pixel → vertex, depth = Z displacement, connect neighbors into triangles (index buffer)
- **UV-map the original DALL-E image as a texture** onto the mesh
- Downsample grid to ~512x512 or so for performance (don't need 1:1 pixel vertices)
- Pass same audio uniforms as point renderer (u_bass, u_mid, u_high, u_beat, u_time, u_coherence)
- At high coherence: solid textured surface, vertices stable
- Audio should subtly displace vertices (bass = breathe/pulse, beat = ripple)
- Must handle the same `setPointCloud`-style API but takes image + depthMap directly

### 2. Coherence Crossfade System
Modify `src/app.ts` to blend between renderers based on coherence:
- **1.0 → 0.7**: Pure mesh, subtle breathing/warping
- **0.7 → 0.4**: Mesh dissolves — vertices scatter, wireframe bleeds through, transition to point cloud
- **0.4 → 0.0**: Point cloud scatters to dust, abstract effects take over

Implementation: render both, use alpha/vertex displacement to dissolve mesh into points. The mesh vertices should literally scatter outward to become the point cloud at low coherence.

### 3. Autonomous Camera (`src/camera-auto.ts`)
Replace orbit camera with an **autonomous fly-through camera**:
- Camera moves itself — NO user controls (no touch, no drag)
- Drift forward slowly through the scene
- Use depth map to avoid flying into surfaces — steer toward open/deep areas
- Gentle banking turns, slight up/down drift
- **Audio-driven**: tempo/BPM affects speed, bass causes camera shake, beat triggers direction changes
- Smooth bezier-like path, never jerky
- When a new scene generates, smoothly transition camera to face the new content
- Keep the camera always moving — never static

### 4. Post-Processing Pipeline (`src/postprocess.ts`)
Render to framebuffer, then apply fullscreen post-processing passes:
- **Bloom**: Bright areas glow, intensity scales with audio energy
- **Frame feedback/trails**: Blend previous frame with current (persistence). Controlled by coherence — more trails at low coherence
- **Kaleidoscope**: Mirror/fold the image into symmetric patterns. Activated at low coherence (< 0.4)
- **Color cycling**: Hue rotation that breathes with audio
- **Chromatic aberration**: RGB split on beats

All effects should be **coherence-gated**:
- High coherence (>0.7): minimal effects, maybe just subtle bloom
- Mid coherence (0.4-0.7): bloom + trails + color breathing
- Low coherence (<0.4): full kaleidoscope + heavy trails + chromatic aberration

### 5. DMT Geometry Overlay (`src/dmt.ts`)
At low coherence, overlay procedural sacred/fractal geometry:
- Sacred geometry patterns (hexagons, flower of life, mandalas)
- Generated procedurally in shaders, not textures
- Patterns emerge from and integrate with the dissolving scene
- Scale/rotate with audio (bass = scale pulse, high = rotation speed)
- Tunnel effect: at very low coherence, warp everything into a forward-rushing tunnel
- These render as an additive overlay on top of the mesh/points

## Architecture Notes

- **Both renderers coexist** — mesh and point cloud are both available, coherence controls which is visible
- The mesh renderer needs the raw image (as WebGL texture) AND the depth map
- Modify `buildPointCloud` or create `buildMeshData` in a new file for mesh geometry
- The autonomous camera should export the same view/projection matrices the render loop expects
- Post-processing needs a framebuffer object (FBO) — render scene to texture, then draw fullscreen quad with effect shaders
- All new uniforms should flow through the existing render loop pattern in app.ts
- **Performance matters** — this runs on iPhone. Keep draw calls minimal, use instancing if needed

## Constraints
- **NO Three.js** — raw WebGL2 only
- **NO new npm dependencies** (except what's already in package.json)
- Must compile clean with `npx vite build`
- Must work on iPhone Safari (WebGL2, no compute shaders, no WebGPU)
- Keep the existing UI working (coherence slider, generate button, audio controls)
- The preset shader buttons (Cosmic Ocean, etc.) can be removed or repurposed — they're from the old flat renderer

## Build & Test
```bash
cd ~/Developer/shader-visuals
npm run dev    # local dev server
npx vite build # production build
```

## Definition of Done
- [ ] Generating a scene shows a solid textured 3D mesh at coherence=100%
- [ ] Lowering coherence dissolves mesh → point cloud → scattered dust
- [ ] Camera autonomously flies through the scene (no user input needed)
- [ ] Post-processing effects activate at lower coherence levels
- [ ] Sacred geometry / tunnel effects appear at very low coherence
- [ ] Audio reactivity drives everything: camera speed, vertex displacement, effect intensity, geometry animation
- [ ] Builds clean, runs on iPhone Safari
