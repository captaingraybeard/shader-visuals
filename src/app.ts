import { AudioEngine } from './audio';
import { Renderer } from './renderer';
import { PointCloudRenderer } from './renderer-points';
import { OrbitCamera } from './camera';
import { UI } from './ui';
import { generateImage } from './imagegen';
import { estimateDepth } from './depth';
import { buildPointCloud } from './pointcloud';
import { presets } from './presets';
import defaultShader from '../shaders/default.frag?raw';
import type { AudioUniforms } from './types';

type RenderMode = 'shader' | 'pointcloud';

export class App {
  private audio: AudioEngine;
  private renderer: Renderer;       // GLSL fallback
  private pointRenderer: PointCloudRenderer;
  private camera: OrbitCamera;
  private ui: UI;

  private intensity = 0.5;
  private coherence = 0.8;
  private mode: RenderMode = 'shader';
  private startTime = 0;
  private running = false;

  constructor() {
    this.audio = new AudioEngine();
    this.renderer = new Renderer();
    this.pointRenderer = new PointCloudRenderer();
    this.camera = new OrbitCamera();
    this.ui = new UI();
  }

  async init(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas element not found');

    // Init GLSL renderer with default shader (fallback)
    this.renderer.init(canvas, defaultShader);
    this.renderer.onError = (msg) => this.ui.showToast(msg, 4000);

    // Init point cloud renderer (shares the same canvas — will take over when active)
    // Point renderer uses a separate canvas to avoid GL context conflicts
    this.initPointCanvas();

    // Attach orbit camera to point cloud canvas
    this.camera.attach(this.pointCanvas!);

    // Init UI
    this.ui.init();
    this.wireUI();

    // Load saved values
    const savedIntensity = localStorage.getItem('shader-visuals-intensity');
    if (savedIntensity !== null) this.intensity = parseFloat(savedIntensity);
    const savedCoherence = localStorage.getItem('shader-visuals-coherence');
    if (savedCoherence !== null) this.coherence = parseFloat(savedCoherence);

    // Load first preset as initial shader (fallback mode)
    if (presets.length > 0) {
      this.renderer.crossfadeTo(presets[0].source, 300);
    }
    this.setMode('shader');

    // Start render loop
    this.startTime = performance.now() / 1000;
    this.running = true;
    this.loop();

    this.registerSW();
  }

  // ── Second canvas for point cloud ─────────────────

  private pointCanvas: HTMLCanvasElement | null = null;

  private initPointCanvas(): void {
    this.pointCanvas = document.createElement('canvas');
    this.pointCanvas.id = 'canvas-points';
    this.pointCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:none;';
    document.body.insertBefore(this.pointCanvas, document.body.firstChild);
    this.pointRenderer.init(this.pointCanvas);
    this.pointRenderer.onError = (msg) => this.ui.showToast(msg, 4000);
  }

  private setMode(mode: RenderMode): void {
    this.mode = mode;
    const shaderCanvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (mode === 'pointcloud') {
      shaderCanvas.style.display = 'none';
      if (this.pointCanvas) this.pointCanvas.style.display = 'block';
    } else {
      shaderCanvas.style.display = 'block';
      if (this.pointCanvas) this.pointCanvas.style.display = 'none';
    }
  }

  // ── UI wiring ─────────────────────────────────────

  private wireUI(): void {
    this.ui.onGenerate = async (scene, _vibe) => {
      const apiKey = localStorage.getItem('shader-visuals-api-key') || '';
      if (!apiKey) {
        this.ui.showToast('Set your OpenAI API key in settings first', 3000);
        return;
      }
      const prompt = scene.trim() || 'a beautiful landscape';

      this.ui.setLoading(true, 'Generating image...');
      try {
        // Step 1: Generate image via DALL-E 3
        const image = await generateImage(prompt, apiKey);

        // Step 2: Estimate depth (ML-based, async)
        const w = image.naturalWidth || image.width;
        const h = image.naturalHeight || image.height;

        // Create a temporary URL from the image for the depth model
        const depthCanvas = document.createElement('canvas');
        depthCanvas.width = w;
        depthCanvas.height = h;
        const depthCtx = depthCanvas.getContext('2d')!;
        depthCtx.drawImage(image, 0, 0, w, h);
        const imageDataUrl = depthCanvas.toDataURL('image/jpeg', 0.9);

        const depthMap = await estimateDepth(
          imageDataUrl, w, h,
          (msg) => this.ui.setLoading(true, msg),
        );

        // Step 3: Build point cloud (edge-aware density)
        this.ui.setLoading(true, 'Building point cloud...');
        const cloud = buildPointCloud(image, depthMap);

        // Step 4: Upload to renderer and switch mode
        this.pointRenderer.setPointCloud(cloud);
        this.setMode('pointcloud');

        this.ui.showToast('Point cloud ready', 2000);
      } catch (e) {
        this.ui.showToast(`Failed: ${(e as Error).message}`, 4000);
      } finally {
        this.ui.setLoading(false);
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
  }

  // ── Render loop ───────────────────────────────────

  private loop = (): void => {
    if (!this.running) return;

    const audioData = this.audio.getUniforms();
    const now = performance.now() / 1000;
    const time = now - this.startTime;

    if (this.mode === 'pointcloud' && this.pointRenderer.hasCloud) {
      // Point cloud mode
      this.pointRenderer.resize();
      const canvas = this.pointCanvas!;
      const aspect = canvas.clientWidth / canvas.clientHeight || 1;

      // Audio can momentarily push coherence down (bass drops = visual chaos)
      const effectiveCoherence = Math.max(0, this.coherence - audioData.u_beat * 0.3);

      // Point scale based on canvas size (smaller on mobile for perf)
      const dpr = window.devicePixelRatio || 1;
      const pointScale = Math.max(3, Math.min(10, (canvas.clientWidth / 200) * dpr));

      this.pointRenderer.render({
        projection: this.camera.getProjectionMatrix(aspect),
        view: this.camera.getViewMatrix(),
        time,
        bass: audioData.u_bass,
        mid: audioData.u_mid,
        high: audioData.u_high,
        beat: audioData.u_beat,
        coherence: effectiveCoherence,
        pointScale,
      });
    } else {
      // GLSL shader fallback mode
      const uniforms: AudioUniforms = {
        u_time: time,
        u_bass: audioData.u_bass,
        u_mid: audioData.u_mid,
        u_high: audioData.u_high,
        u_beat: audioData.u_beat,
        u_intensity: this.intensity,
        u_resolution: [window.innerWidth, window.innerHeight],
      };
      this.renderer.render(uniforms);
    }

    requestAnimationFrame(this.loop);
  };

  private async registerSW(): Promise<void> {
    // Unregister any existing service workers to prevent stale cache issues
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      // Clear all caches
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
  }
}
