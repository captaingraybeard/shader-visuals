# Mobile Integration Guide

## What I Built

Two new files:

1. **`src/mobile-detect.ts`** — Device detection and render scaling
2. **`src/three-scene-mobile.ts`** — Simplified scene renderer for mobile

## Key Differences: Full vs Mobile

| Feature | Full | Mobile |
|---------|------|--------|
| Band uniforms | 8 (u_band0-7) | 3 (bass/mid/high) |
| Segment coherence | Per-segment array | Single global |
| Spotlight system | 3 effects (scale/float/shatter) | Disabled |
| Creature system | GPU texture lookup | Disabled |
| Dual layer | Front + back layer | Single layer |
| Point shape | Coherence-based morphing | Simple circle |
| Render scale | 1.0 (full DPR) | 0.5 (half res) |
| Point count | Unlimited | 50K-150K max |
| Crossfade | 1500ms | 1000ms |

## Integration

In `app.ts`, add at the top:

```typescript
import { detectDevice, type DeviceProfile, downsamplePointCloud } from './mobile-detect';
import { ThreeSceneMobile, type MobileRenderOpts } from './three-scene-mobile';
```

In the `App` class:

```typescript
export class App {
  // Add device profile
  private deviceProfile!: DeviceProfile;
  
  // Scene can be either type
  private threeScene!: ThreeScene | ThreeSceneMobile;
  private isMobileScene = false;
  
  // ...existing fields...

  async init(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas element not found');

    // Detect device FIRST
    this.deviceProfile = detectDevice();
    this.isMobileScene = this.deviceProfile.shaderComplexity !== 'full';
    
    console.log('Device profile:', this.deviceProfile);

    // Init appropriate scene
    if (this.isMobileScene) {
      this.threeScene = new ThreeSceneMobile(canvas, this.deviceProfile.renderScale);
    } else {
      this.threeScene = new ThreeScene(canvas);
    }
    
    // Skip post-processing on mobile
    if (!this.isMobileScene) {
      this.postprocess.init(
        this.threeScene.renderer,
        this.threeScene.scene,
        this.threeScene.camera,
      );
    }

    // ...rest of init...
  }
}
```

Modify `setPointCloud` call to downsample:

```typescript
// In generateScene, after getting result from server:
if (this.deviceProfile.maxPoints < Infinity) {
  const downsampled = downsamplePointCloud(
    result.cloud.positions,
    result.cloud.colors,
    result.cloud.segments,
    result.cloud.objectIds,
    this.deviceProfile.maxPoints,
  );
  result.cloud = {
    ...result.cloud,
    positions: downsampled.positions,
    colors: downsampled.colors,
    segments: downsampled.segments,
    objectIds: downsampled.objectIds,
    count: downsampled.count,
  };
}
this.threeScene.setPointCloud(result.cloud);
```

Modify render loop for mobile:

```typescript
private renderScene(time: number, dt: number, audioData: AudioData): void {
  // ... camera update code ...

  if (this.isMobileScene) {
    // Mobile path — simplified uniforms
    const mobileScene = this.threeScene as ThreeSceneMobile;
    const mobileOpts: MobileRenderOpts = {
      projection,
      view,
      time,
      bass: audioData.u_bass,
      mid: audioData.u_mid,
      high: audioData.u_high,
      beat: audioData.u_beat,
      coherence: this.coherence,
      pointScale: Math.max(1.5, Math.min(4, (canvas.clientWidth / 300) * dpr)),
      projMode: this.panoramaMode ? 1 : 0,
    };
    mobileScene.update(mobileOpts);
    mobileScene.render();
  } else {
    // Full path — existing code
    // ... all the segment coherence, chakra, creature updates ...
  }
}
```

## Testing

1. On desktop, force mobile mode by adding to URL: `?forceMobile=true`
2. Or in console: `localStorage.setItem('forceMobile', 'true'); location.reload();`

Add to `detectDevice()`:
```typescript
// Debug override
if (localStorage.getItem('forceMobile') === 'true' || 
    new URLSearchParams(location.search).has('forceMobile')) {
  return { ...result, isMobile: true, isLowEnd: true, shaderComplexity: 'minimal' };
}
```

## Why This Works

The original shader is ~200 lines with:
- 8-band frequency analysis (many uniform uploads per frame)
- Spotlight system with 3 simultaneous effects (lots of branching)
- Creature GPU texture lookups (texture fetches are expensive on mobile)
- Dual-layer rendering (2x draw calls, 2x vertex processing)
- Dynamic point shape based on coherence (extra fragment shader math)

The mobile shader:
- Uses 3 aggregate bands (bass/mid/high already computed)
- No spotlight effects (removes all that object ID branching)
- No creature system (no texture fetches)
- Single layer (half the draw calls)
- Simple circular points (cheaper fragment shader)
- Half resolution (4x fewer pixels to shade)
- Fewer points (less vertex processing)

Combined, this should be ~10-20x lighter on mobile GPUs.
