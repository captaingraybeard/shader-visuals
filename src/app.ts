import { AudioEngine, TONE_PRESETS } from './audio';
import type { AudioData } from './audio';
import { AutoCamera } from './camera-auto';
import { ThreeScene } from './three-scene';
import { ThreePostProcess } from './three-postprocess';
import { UI } from './ui';
import type { ProjectionMode } from './pointcloud';
import { generateFromServer } from './server';

export class App {
  private audio: AudioEngine;
  private threeScene!: ThreeScene;
  private postprocess: ThreePostProcess;
  private camera: AutoCamera;
  private ui: UI;

  private intensity = 0.5;
  private coherence = 0.8;
  private form = 0;
  private highlightCat = -1;
  private panoramaMode = false;
  private startTime = 0;
  private running = false;
  private lastFrameTime = 0;

  // Pre-allocated arrays for render loop (avoid GC pressure)
  private _bandEnergies = new Float64Array(6);
  private _segCoherence = [0, 0, 0, 0, 0, 0];
  private _chakra = [0, 0, 0, 0, 0, 0, 0];

  // Journey mode
  private journeyMode = false;
  private journeyGenerating = false;
  private journeyVariation = 1;
  private lastGenerateTime = 0;
  private lastPrompt = '';
  private lastVibe = '';
  private lastImageMode: 'standard' | 'panorama' = 'standard';
  private lastProjection: ProjectionMode = 'planar';

  // Current scene data
  private hasScene = false;
  private lastImageDataUrl: string | null = null;
  private lastDepthMap: Float32Array | null = null;
  private lastSegments: Uint8Array | null = null;
  private lastImageW = 0;
  private lastImageH = 0;

  constructor() {
    this.audio = new AudioEngine();
    this.postprocess = new ThreePostProcess();
    this.camera = new AutoCamera();
    this.ui = new UI();
  }

  async init(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas element not found');

    // Init Three.js scene (constructor takes canvas)
    this.threeScene = new ThreeScene(canvas);

    // Init post-processing with Three.js renderer/scene/camera
    this.postprocess.init(
      this.threeScene.renderer,
      this.threeScene.scene,
      this.threeScene.camera,
    );

    // Init UI
    this.ui.init();
    this.wireUI();

    // Load saved values
    this.panoramaMode = localStorage.getItem('shader-visuals-panorama') === 'true';
    const savedIntensity = localStorage.getItem('shader-visuals-intensity');
    if (savedIntensity !== null) this.intensity = parseFloat(savedIntensity);
    const savedCoherence = localStorage.getItem('shader-visuals-coherence');
    if (savedCoherence !== null) this.coherence = parseFloat(savedCoherence);
    const savedForm = localStorage.getItem('shader-visuals-form');
    if (savedForm !== null) this.form = parseFloat(savedForm);

    // Debug overlay (visible on-screen for remote debugging)
    this.initDebugOverlay();

    // Start render loop
    this.startTime = performance.now() / 1000;
    this.lastFrameTime = this.startTime;
    this.running = true;
    this.loop();

    this.registerSW();
  }

  // ── UI wiring ─────────────────────────────────────

  private wireUI(): void {
    this.ui.onGenerate = async (scene, _vibe) => {
      await this.generateScene(scene, _vibe);
    };

    this.ui.onJourneyToggle = (enabled) => {
      this.journeyMode = enabled;
      this.journeyVariation = 1;
      this.journeyGenerating = false;
      if (enabled) {
        this.ui.showToast('Journey mode ON — continuous generation', 2000);
      } else {
        this.ui.showToast('Journey mode OFF', 2000);
      }
    };

    this.ui.onIntensityChange = (value) => {
      this.intensity = value;
      localStorage.setItem('shader-visuals-intensity', String(value));
    };

    this.ui.onCoherenceChange = (value) => {
      this.coherence = value;
      localStorage.setItem('shader-visuals-coherence', String(value));
    };

    this.ui.onMicToggle = async () => {
      if (this.audio.isActive && this.audio.currentMode === 'mic') {
        this.audio.stop();
        this.ui.setMicActive(false);
        this.ui.setMusicActive(false);
      } else {
        try {
          await this.audio.initMic();
          this.ui.setMicActive(true);
          this.ui.setMusicActive(false);
        } catch {
          this.ui.showToast('Microphone access denied', 3000);
        }
      }
    };

    this.ui.onMusicFile = (file: File) => {
      try {
        this.audio.initFile(file);
        this.ui.setMusicActive(true);
        this.ui.setMicActive(false);
        this.ui.showToast(`Playing: ${file.name}`, 2000);
      } catch {
        this.ui.showToast('Failed to play audio file', 3000);
      }
    };

    this.ui.onApiKeyChange = (key) => {
      localStorage.setItem('shader-visuals-api-key', key);
    };

    this.ui.onTonePreset = (presetName) => {
      if (!presetName) {
        this.audio.stop();
        this.ui.setToneActive(false);
        this.ui.setMicActive(false);
        this.ui.setMusicActive(false);
        return;
      }
      const preset = TONE_PRESETS.find(p => p.name === presetName);
      if (preset) {
        this.audio.initTone(preset);
        this.ui.setToneActive(true);
        this.ui.setMicActive(false);
        this.ui.setMusicActive(false);
        this.ui.showToast(`🔊 ${preset.name} — ${preset.fundamental}Hz`, 2000);
      }
    };

    this.ui.onFormChange = (value) => {
      this.form = value;
      localStorage.setItem('shader-visuals-form', String(value));
    };

    this.ui.onCameraReset = () => {
      this.camera.reset();
    };

    this.ui.onPanoramaToggle = (enabled) => {
      this.panoramaMode = enabled;
      this.ui.showToast(enabled ? '360° panorama mode' : 'Standard mode', 2000);
    };

    this.ui.onDownload = () => {
      if (!this.lastImageDataUrl) {
        this.ui.showToast('No image generated yet', 2000);
        return;
      }
      const ts = Date.now();
      const w = this.lastImageW;
      const h = this.lastImageH;
      const download = (url: string, name: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
      };
      download(this.lastImageDataUrl, `scene-${ts}.png`);
      if (this.lastDepthMap) {
        setTimeout(() => {
          download(depthToDataUrl(this.lastDepthMap!, w, h), `depth-${ts}.png`);
        }, 300);
      }
      if (this.lastSegments) {
        setTimeout(() => {
          download(segmentToDataUrl(this.lastSegments!, w, h), `segments-${ts}.png`);
        }, 600);
      }
      this.ui.showToast('Saving scene + depth + segments', 2000);
    };
  }

  // ── Scene generation ─────────────────────────────

  private async generateScene(scene: string, vibe: string, isJourney = false): Promise<void> {
    const apiKey = localStorage.getItem('shader-visuals-api-key') || '';
    if (!apiKey) {
      this.ui.showToast('Set your OpenAI API key in settings first', 3000);
      return;
    }
    const prompt = scene.trim() || 'a beautiful landscape';

    const imageMode = this.panoramaMode ? 'panorama' as const : 'standard' as const;
    const projection: ProjectionMode = this.panoramaMode ? 'equirectangular' : 'planar';

    this.lastPrompt = prompt;
    this.lastVibe = vibe;
    this.lastImageMode = imageMode;
    this.lastProjection = projection;

    const loadingMsg = isJourney
      ? `Journey: generating variation ${this.journeyVariation}...`
      : this.panoramaMode ? 'Generating 360° panorama...' : 'Generating image...';
    this.ui.setLoading(true, loadingMsg);

    try {
      const serverPrompt = isJourney ? `${prompt} variation ${this.journeyVariation}` : prompt;
      const result = await generateFromServer(
        serverPrompt, vibe, imageMode, apiKey,
        (msg) => this.ui.setLoading(true, isJourney ? `Journey v${this.journeyVariation}: ${msg}` : msg),
      );

      this.threeScene.setPointCloud(result.cloud);
      this.camera.setMode(projection);
      this.camera.resetForNewScene();

      const timing = result.metadata.timing as Record<string, number> | undefined;
      const totalSec = timing?.total_ms ? (timing.total_ms / 1000).toFixed(1) : '?';
      this.ui.showToast(
        `${(result.cloud.count/1000).toFixed(0)}K pts | Server ${totalSec}s`,
        5000,
      );

      if (result.labels.length > 0) {
        this.ui.showSegmentPanel(result.labels, (cat) => {
          this.highlightCat = cat === null ? -1 : cat;
        });
      }

      this.lastDepthMap = null;
      this.lastSegments = null;
      this.lastImageDataUrl = null;

      this.hasScene = true;
      this.lastGenerateTime = performance.now() / 1000;
      this.ui.setDownloadVisible(false);
    } catch (e) {
      this.ui.showError((e as Error).message);
    } finally {
      this.ui.setLoading(false);
      if (isJourney) this.journeyGenerating = false;
    }
  }

  private tickJourney(): void {
    if (!this.journeyMode || this.journeyGenerating || !this.hasScene) return;
    if (!this.audio.isActive) return;

    const now = performance.now() / 1000;
    const elapsed = now - this.lastGenerateTime;
    if (elapsed < 15) return;

    this.journeyGenerating = true;
    this.journeyVariation++;
    this.generateScene(this.lastPrompt, this.lastVibe, true);
  }

  // ── Render loop ───────────────────────────────────

  private loop = (): void => {
    if (!this.running) return;

    const audioData = this.audio.getUniforms();
    const now = performance.now() / 1000;
    const time = now - this.startTime;
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Journey mode: auto-generate next scene
    this.tickJourney();

    // Update creature system before rendering
    if (this.threeScene.hasCloud) {
      this.threeScene.updateCreatures(dt, audioData, time);
    }

    this.renderScene(time, dt, audioData);
    this.updateDebug(audioData);

    requestAnimationFrame(this.loop);
  };

  private renderScene(
    time: number,
    dt: number,
    audioData: AudioData,
  ): void {
    const canvas = this.threeScene.renderer.domElement;
    const aspect = canvas.clientWidth / canvas.clientHeight || 1;
    const dpr = window.devicePixelRatio || 1;

    // Slider controls sensitivity: 0 = max audio disruption, 1 = no disruption (fully coherent)
    const sensitivity = (1.0 - this.coherence) * 2.0; // slider=1 → 0 disruption, slider=0 → 2x disruption
    const be = this._bandEnergies;
    be[0] = audioData.u_band0 * 0.6 + audioData.u_band1 * 0.4;                              // cat 0: BASS_SUBJECT
    be[1] = audioData.u_band2 * 0.3 + audioData.u_band3 * 0.5 + audioData.u_band4 * 0.2;    // cat 1: MID_ORGANIC
    be[2] = audioData.u_band5 * 0.2 + audioData.u_band6 * 0.4 + audioData.u_band7 * 0.4;    // cat 2: HIGH_SKY
    be[3] = audioData.u_beat * 0.7 + audioData.u_band0 * 0.3;                                // cat 3: BEAT_GROUND
    be[4] = audioData.u_band3 * 0.3 + audioData.u_band4 * 0.4 + audioData.u_band5 * 0.3;    // cat 4: MID_STRUCTURE
    be[5] = audioData.u_band1 * 0.3 + audioData.u_band2 * 0.4 + audioData.u_band3 * 0.3;    // cat 5: LOW_AMBIENT
    const segCoherence = this._segCoherence;
    for (let i = 0; i < 6; i++) segCoherence[i] = Math.max(0, Math.min(1, 1.0 - be[i] * sensitivity));

    // Update autonomous camera
    this.camera.update(dt, audioData.u_bass, audioData.u_mid, audioData.u_high, audioData.u_beat);
    const projection = this.camera.getProjectionMatrix(aspect);
    const view = this.camera.getViewMatrix();

    // Handle resize
    const cw = canvas.clientWidth * dpr;
    const ch = canvas.clientHeight * dpr;
    if (canvas.width !== cw || canvas.height !== ch) {
      this.threeScene.resize();
      this.postprocess.resize(cw, ch);
    }

    // Update scene graph (uniforms, camera, crossfade) — does NOT render
    if (this.threeScene.hasCloud) {
      const pointScale = Math.max(1.5, Math.min(5, (canvas.clientWidth / 300) * dpr));

      this.threeScene.update({
        projection,
        view,
        time,
        bass: audioData.u_bass,
        mid: audioData.u_mid,
        high: audioData.u_high,
        beat: audioData.u_beat,
        band0: audioData.u_band0,
        band1: audioData.u_band1,
        band2: audioData.u_band2,
        band3: audioData.u_band3,
        band4: audioData.u_band4,
        band5: audioData.u_band5,
        band6: audioData.u_band6,
        band7: audioData.u_band7,
        coherence: this.coherence,
        segCoherence,
        pointScale,
        form: this.form,
        highlightCat: this.highlightCat,
        projMode: this.panoramaMode ? 1 : 0,
        chakra: (this._chakra[0] = audioData.chakraRoot, this._chakra[1] = audioData.chakraSacral,
          this._chakra[2] = audioData.chakraSolar, this._chakra[3] = audioData.chakraHeart,
          this._chakra[4] = audioData.chakraThroat, this._chakra[5] = audioData.chakraThirdEye,
          this._chakra[6] = audioData.chakraCrown, this._chakra),
        demonsLow: audioData.demonsLow,
        demonsHigh: audioData.demonsHigh,
      });
    }

    // Direct render — no screen-space post-processing
    this.threeScene.renderer.render(this.threeScene.scene, this.threeScene.camera);
  }

  // ── Debug overlay ──────────────────────────────────
  private debugEl: HTMLDivElement | null = null;
  private frameCount = 0;

  private debugVisible = false;

  private initDebugOverlay(): void {
    const el = document.createElement('div');
    el.id = 'debug-overlay';
    el.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;color:#0f0;font:11px/1.4 monospace;background:rgba(0,0,0,0.7);padding:6px 10px;border-radius:4px;pointer-events:none;max-width:90vw;white-space:pre-wrap;display:none;';
    document.body.appendChild(el);
    this.debugEl = el;

    // Triple-tap to toggle debug overlay
    let tapCount = 0;
    let lastTap = 0;
    document.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < 400) {
        tapCount++;
        if (tapCount >= 2) {
          this.debugVisible = !this.debugVisible;
          el.style.display = this.debugVisible ? 'block' : 'none';
          tapCount = 0;
        }
      } else {
        tapCount = 0;
      }
      lastTap = now;
    });
  }

  private updateDebug(audioData: AudioData): void {
    this.frameCount++;
    if (!this.debugEl || !this.debugVisible || this.frameCount % 30 !== 0) return;
    const gl = this.threeScene.renderer.getContext();
    const info = this.threeScene.renderer.info;
    const lines = [
      `frame: ${this.frameCount}`,
      `hasCloud: ${this.threeScene.hasCloud}`,
      `scene children: ${this.threeScene.scene.children.length}`,
      `gl: ${gl ? 'ok' : 'MISSING'}`,
      `draw calls: ${info.render.calls}`,
      `points: ${info.render.points}`,
      `triangles: ${info.render.triangles}`,
      `programs: ${info.programs?.length ?? '?'}`,
      `bass: ${audioData.u_bass.toFixed(2)} mid: ${audioData.u_mid.toFixed(2)}`,
      `coherence: ${this.coherence.toFixed(2)}`,
      `panorama: ${this.panoramaMode}`,
      `hasScene: ${this.hasScene}`,
    ];
    // Check GL errors
    if (gl) {
      const err = gl.getError();
      if (err !== gl.NO_ERROR) lines.push(`GL ERROR: ${err}`);
    }
    this.debugEl.textContent = lines.join('\n');
  }

  private async registerSW(): Promise<void> {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
  }
}

// ── Helpers for download visualizations ──────────────

const SEG_COLORS = [
  [255, 107, 107],
  [81, 207, 102],
  [116, 192, 252],
  [255, 212, 59],
  [177, 151, 252],
  [134, 142, 150],
];

function depthToDataUrl(depthMap: Float32Array, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  for (let i = 0; i < depthMap.length; i++) {
    const v = Math.round(depthMap[i] * 255);
    imgData.data[i * 4] = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

function segmentToDataUrl(segments: Uint8Array, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  for (let i = 0; i < segments.length; i++) {
    const c = SEG_COLORS[segments[i]] || [128, 128, 128];
    imgData.data[i * 4] = c[0];
    imgData.data[i * 4 + 1] = c[1];
    imgData.data[i * 4 + 2] = c[2];
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
