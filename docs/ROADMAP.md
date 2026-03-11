# shader-visuals Roadmap

## Inspiration Sources
- **particles.casberry** — LLM-generated animation code, addControl() pattern, particle styles
- **@techartist_ procedural explosions** — volumetric fireballs, raymarched noise

---

## 🎯 Immediate (This Week)

### 1. `addControl()` API
**Goal:** Let LLM-generated code create runtime sliders/parameters

```typescript
// In animation code (LLM-generated or manual)
addControl('explosionRadius', 0.5, 0, 2);
addControl('turbulence', 0.3, 0, 1);

// Creates UI slider, value available as uniform
```

- Map-based registry, zero-alloc per-frame lookup
- Auto-generates slider UI
- Values passed to GPU as uniforms
- **File:** `src/control-registry.ts`

### 2. Dual-Prompt Architecture
**Goal:** Separate scene generation from animation behavior

Current flow:
```
[scene prompt] → image → depth → segments → point cloud → shader
```

New flow:
```
[scene prompt] → image → depth → segments → point cloud
[animation prompt] → behavior code → injected into shader
```

- Scene stays static, animation hot-swaps
- LLM generates GLSL snippets (not JS like casberry)
- Sandbox validation before injection
- **Files:** `src/llm-shader-gen.ts`, `src/shader-sandbox.ts`

---

## 🔥 Near-Term (Next 2 Weeks)

### 3. Procedural Explosion Effect
**Goal:** Beat-triggered volumetric fireballs

Technique:
- Raymarched SDF sphere
- FBM noise displacement for turbulence
- Color gradient: white core → yellow → orange → red → smoke
- Shockwave ring expanding outward

Triggers:
- `u_beat > 0.8` spike
- Optional: explode specific segmented objects

Mobile fallback:
- 2D radial gradient + ring (skip raymarching)

**File:** `src/effects/explosion.ts`

### 4. Particle Style Switcher
**Goal:** Multiple rendering modes beyond points

Styles to steal/adapt:
- Glass (refractive, environment-mapped)
- Ink (bleed/spread simulation)
- Paint (thick impasto strokes)
- Smoke (soft, volumetric)
- Sparks (bright trails)

**File:** `src/particle-styles.ts`

### 5. 3D Object Placement
**Goal:** Load GLB models, sample surface points, merge into cloud

Flow:
- Load GLB via Three.js
- Sample surface points (mesh-surface-sampler)
- Convert to point cloud format
- Merge with scene cloud
- Tag with unique objectId for spotlight effects

**File:** `src/model-loader.ts`

---

## 🌙 Later (Month+)

### 6. Hand Gesture Control
- MediaPipe Hands integration
- Map gestures to controls (pinch = intensity, swipe = camera)
- Optional: hand position as attractor/repulsor

### 7. Floating 3D Annotations
- Text labels that track world positions
- Fade with depth
- LLM-generated descriptions of scene elements

### 8. Multi-Scene Journeys
- Chain multiple scenes with crossfade
- LLM plans a "journey" through visual themes
- Audio-reactive scene transitions

---

## Technical Debt / Polish

- [ ] Mobile integration (use three-scene-mobile.ts)
- [ ] Brave Search API key for research
- [ ] Service worker caching (currently disabled)
- [ ] WebGPU migration path (future-proofing)

---

## Key Architecture Decisions

### CPU vs GPU
- **casberry:** CPU particle updates (20k limit)
- **shader-visuals:** GPU compute (creature-system.ts) — already ahead

### LLM Code Target
- **casberry:** JS functions, CPU execution
- **shader-visuals:** GLSL snippets, GPU execution via GPUComputationRenderer

### Security Sandbox
Both need:
- Forbidden globals blocklist
- Timeout/kill for slow code
- Dry-run validation before apply
- Iteration caps in generated code

---

## Priority Stack

1. **addControl() API** — foundation for everything else
2. **Explosion effect** — high visual impact, self-contained
3. **Dual-prompt architecture** — enables animation hot-swap
4. **Particle styles** — variety without regenerating scenes
5. **3D object placement** — expanded scene content
