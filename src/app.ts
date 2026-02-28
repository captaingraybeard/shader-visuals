import { AudioEngine, TONE_PRESETS } from './audio';
import type { AudioData } from './audio';
import { Renderer } from './renderer';
import { PointCloudRenderer } from './renderer-points';
import { AutoCamera } from './camera-auto';
import { PostProcessor } from './postprocess';
import { DMTOverlay } from './dmt';
import { UI } from './ui';
import type { ProjectionMode } from './pointcloud';
import { generateFromServer } from './server';
import { presets } from './presets';
import defaultShader from '../shaders/default.frag?raw';
import type { AudioUniforms } from './types';

type RenderMode = 'shader' | 'scene';

export class App {
  private audio: AudioEngine;
  private renderer: Renderer;            // GLSL fallback
  private pointRenderer!: PointCloudRenderer;
  private camera: AutoCamera;
  private postprocess!: PostProcessor;
  private dmt!: DMTOverlay;
  private ui: UI;

  private intensity = 0.5;
  private coherence = 0.8;
  private form = 0;  // 0=grid/lines, 1=scattered points
  private highlightCat = -1; // -1=none, 0-5=highlight category
  private panoramaMode = false; // equirectangular 360° mode
  private mode: RenderMode = 'shader';
  private startTime = 0;
  private running = false;
  private lastFrameTime = 0;

  // Journey mode (continuous auto-generation)
  private journeyMode = false;
  private journeyGenerating = false;
  private journeyVariation = 1;
  private lastGenerateTime = 0;
  private lastPrompt = '';
  private lastVibe = '';
  private lastImageMode: 'standard' | 'panorama' = 'standard';
  private lastProjection: ProjectionMode = 'planar';

  // Scene canvas and shared GL context
  private sceneCanvas: HTMLCanvasElement | null = null;
  private sceneGL: WebGL2RenderingContext | null = null;

  // Current scene data for both renderers
  private hasScene = false;
  private lastImageDataUrl: string | null = null;
  private lastDepthMap: Float32Array | null = null;
  private lastSegments: Uint8Array | null = null;
  private lastImageW = 0;
  private lastImageH = 0;

  constructor() {
    this.audio = new AudioEngine();
    this.renderer = new Renderer();
    this.camera = new AutoCamera();
    this.ui = new UI();
  }

  async init(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas element not found');

    // Init GLSL renderer with default shader (fallback)
    this.renderer.init(canvas, defaultShader);
    this.renderer.onError = (msg) => this.ui.showToast(msg, 4000);

    // Init scene canvas (mesh + point cloud + post-processing share one GL context)
    this.initSceneCanvas();

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

    // Load first preset as initial shader (fallback mode)
    if (presets.length > 0) {
      this.renderer.crossfadeTo(presets[0].source, 300);
    }
    this.setMode('shader');

    // Start render loop
    this.startTime = performance.now() / 1000;
    this.lastFrameTime = this.startTime;
    this.running = true;
    this.loop();

    this.registerSW();
  }

  // ── Scene canvas (shared GL context for mesh, points, post-fx, DMT) ──

  private initSceneCanvas(): void {
    this.sceneCanvas = document.createElement('canvas');
    this.sceneCanvas.id = 'canvas-scene';
    this.sceneCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:none;';
    document.body.insertBefore(this.sceneCanvas, document.body.firstChild);

    // Create shared GL context
    const gl = this.sceneCanvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) {
      this.ui.showToast('WebGL2 not supported', 4000);
      return;
    }
    this.sceneGL = gl;

    // Point cloud renderer — primary scene renderer
    this.pointRenderer = new PointCloudRenderer();
    this.pointRenderer.onError = (msg) => this.ui.showToast(msg, 4000);
    this.pointRenderer.initShared(gl);

    // Post-processing and DMT share the same GL context
    this.postprocess = new PostProcessor();
    this.postprocess.init(gl);

    this.dmt = new DMTOverlay();
    this.dmt.init(gl);
  }

  private setMode(mode: RenderMode): void {
    this.mode = mode;
    const shaderCanvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (mode === 'scene') {
      shaderCanvas.style.display = 'none';
      if (this.sceneCanvas) this.sceneCanvas.style.display = 'block';
    } else {
      shaderCanvas.style.display = 'block';
      if (this.sceneCanvas) this.sceneCanvas.style.display = 'none';
    }
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

    this.ui.onPresetSelect = (name) => {
      const preset = presets.find((p) => p.name === name);
      if (preset) {
        this.setMode('shader');
        this.renderer.crossfadeTo(preset.source);
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
        // Stop tone
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

    // Store for journey mode re-use
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

      this.pointRenderer.setPointCloud(result.cloud);
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
      this.setMode('scene');
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
    if (!this.audio.isActive) return; // pause when no audio

    const now = performance.now() / 1000;
    const elapsed = now - this.lastGenerateTime;
    if (elapsed < 15) return; // minimum 15s between generations

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

    if (this.mode === 'scene' && this.hasScene) {
      this.renderScene(time, dt, audioData);
    } else {
      // GLSL shader fallback mode
      const uniforms: AudioUniforms = {
        u_time: time,
        u_bass: audioData.u_bass,
        u_mid: audioData.u_mid,
        u_high: audioData.u_high,
        u_beat: audioData.u_beat,
        u_band0: audioData.u_band0,
        u_band1: audioData.u_band1,
        u_band2: audioData.u_band2,
        u_band3: audioData.u_band3,
        u_band4: audioData.u_band4,
        u_band5: audioData.u_band5,
        u_band6: audioData.u_band6,
        u_band7: audioData.u_band7,
        u_intensity: this.intensity,
        u_resolution: [window.innerWidth, window.innerHeight],
      };
      this.renderer.render(uniforms);
    }

    requestAnimationFrame(this.loop);
  };

  private renderScene(
    time: number,
    dt: number,
    audioData: AudioData,
  ): void {
    const gl = this.sceneGL;
    const canvas = this.sceneCanvas;
    if (!gl || !canvas) return;

    // Resize canvas to match display
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth * dpr;
    const ch = canvas.clientHeight * dpr;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const aspect = canvas.clientWidth / canvas.clientHeight || 1;

    // Coherence is now purely user-controlled via slider.
    // Audio affects the scene through per-segment displacement in the shader,
    // NOT by reducing coherence (which triggers scatter and destroys the scene).
    const effectiveCoherence = this.coherence;

    // Update autonomous camera
    this.camera.update(dt, audioData.u_bass, audioData.u_mid, audioData.u_high, audioData.u_beat);
    const projection = this.camera.getProjectionMatrix(aspect);
    const view = this.camera.getViewMatrix();

    // Begin post-processing scene pass
    this.postprocess.beginScene();

    // GL state
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Point cloud — the entire scene
    if (this.pointRenderer.hasCloud) {
      const pointScale = Math.max(1.5, Math.min(5, (canvas.clientWidth / 300) * dpr));

      this.pointRenderer.render({
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
        coherence: effectiveCoherence,
        pointScale,
        form: this.form,
        highlightCat: this.highlightCat,
        projMode: this.panoramaMode ? 1 : 0,
      });
    }

    // DMT overlay (into scene FBO)
    this.dmt.render({
      time,
      bass: audioData.u_bass,
      mid: audioData.u_mid,
      high: audioData.u_high,
      beat: audioData.u_beat,
      coherence: effectiveCoherence,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    });

    // End scene — apply post-processing to screen
    this.postprocess.endScene({
      time,
      bass: audioData.u_bass,
      mid: audioData.u_mid,
      high: audioData.u_high,
      beat: audioData.u_beat,
      coherence: effectiveCoherence,
    });
  }

  private async registerSW(): Promise<void> {
    // Unregister any existing service workers to prevent stale cache issues
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
  [255, 107, 107], // cat 0 BASS_SUBJECT — red
  [81, 207, 102],  // cat 1 MID_ORGANIC — green
  [116, 192, 252], // cat 2 HIGH_SKY — blue
  [255, 212, 59],  // cat 3 BEAT_GROUND — yellow
  [177, 151, 252], // cat 4 MID_STRUCTURE — purple
  [134, 142, 150], // cat 5 LOW_AMBIENT — gray
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
