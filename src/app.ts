import { AudioEngine } from './audio';
import { Renderer } from './renderer';
import { PointCloudRenderer } from './renderer-points';
import { MeshRenderer, buildMeshData } from './renderer-mesh';
import { AutoCamera } from './camera-auto';
import { PostProcessor } from './postprocess';
import { DMTOverlay } from './dmt';
import { UI } from './ui';
import { generateImage } from './imagegen';
import { estimateDepth } from './depth';
import { buildPointCloud } from './pointcloud';
import { presets } from './presets';
import defaultShader from '../shaders/default.frag?raw';
import type { AudioUniforms } from './types';

type RenderMode = 'shader' | 'scene';

export class App {
  private audio: AudioEngine;
  private renderer: Renderer;            // GLSL fallback
  private pointRenderer!: PointCloudRenderer;
  private meshRenderer!: MeshRenderer;
  private camera: AutoCamera;
  private postprocess!: PostProcessor;
  private dmt!: DMTOverlay;
  private ui: UI;

  private intensity = 0.5;
  private coherence = 0.8;
  private mode: RenderMode = 'shader';
  private startTime = 0;
  private running = false;
  private lastFrameTime = 0;

  // Scene canvas and shared GL context
  private sceneCanvas: HTMLCanvasElement | null = null;
  private sceneGL: WebGL2RenderingContext | null = null;

  // Current scene data for both renderers
  private hasScene = false;

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

    // Init mesh renderer (creates the shared GL context)
    this.meshRenderer = new MeshRenderer();
    this.meshRenderer.onError = (msg) => this.ui.showToast(msg, 4000);
    this.sceneGL = this.meshRenderer.init(this.sceneCanvas);

    if (!this.sceneGL) {
      this.ui.showToast('WebGL2 not supported', 4000);
      return;
    }

    // Init point cloud renderer on separate canvas (different GL context)
    // We'll overlay the point renderer on the scene when needed
    this.pointRenderer = new PointCloudRenderer();
    this.pointRenderer.onError = (msg) => this.ui.showToast(msg, 4000);

    // Post-processing and DMT use the same GL context as the mesh
    this.postprocess = new PostProcessor();
    this.postprocess.init(this.sceneGL);

    this.dmt = new DMTOverlay();
    this.dmt.init(this.sceneGL);
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

        // Step 2: Estimate depth
        const w = image.naturalWidth || image.width;
        const h = image.naturalHeight || image.height;

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

        // Step 3: Build mesh data
        this.ui.setLoading(true, 'Building mesh...');
        const meshData = buildMeshData(depthMap, w, h, 256);
        this.meshRenderer.setMeshData(meshData, image);

        // Step 4: Build point cloud for dissolve transition
        this.ui.setLoading(true, 'Building point cloud...');
        const cloud = buildPointCloud(image, depthMap);

        // Init point renderer if needed (lazy init on separate hidden canvas)
        if (!this.pointRenderer.hasCloud) {
          const ptCanvas = document.createElement('canvas');
          ptCanvas.id = 'canvas-points-hidden';
          ptCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:none;pointer-events:none;';
          document.body.insertBefore(ptCanvas, document.body.firstChild);
          this.pointRenderer.init(ptCanvas);
        }
        this.pointRenderer.setPointCloud(cloud);

        // Step 5: Set up autonomous camera with depth info
        this.camera.setDepthMap(depthMap, w, h);
        this.camera.resetForNewScene();

        // Step 6: Switch to scene mode
        this.hasScene = true;
        this.setMode('scene');

        this.ui.showToast('Scene ready', 2000);
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
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

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
    audioData: { u_bass: number; u_mid: number; u_high: number; u_beat: number },
  ): void {
    const gl = this.sceneGL;
    const canvas = this.sceneCanvas;
    if (!gl || !canvas) return;

    // Resize
    this.meshRenderer.resize();
    const aspect = canvas.clientWidth / canvas.clientHeight || 1;

    // Audio can momentarily push coherence down
    const effectiveCoherence = Math.max(0, this.coherence - audioData.u_beat * 0.3);

    // Update autonomous camera
    this.camera.update(dt, audioData.u_bass, audioData.u_mid, audioData.u_high, audioData.u_beat);
    const projection = this.camera.getProjectionMatrix(aspect);
    const view = this.camera.getViewMatrix();

    // Coherence crossfade:
    // 1.0 → 0.7: Pure mesh, subtle breathing
    // 0.7 → 0.4: Mesh dissolves (dissolve 0→1), wireframe shows
    // 0.4 → 0.0: Point cloud scatters to dust, DMT takes over
    const dissolve = effectiveCoherence < 0.7
      ? Math.min(1.0, (0.7 - effectiveCoherence) / 0.3)
      : 0.0;

    const showPoints = effectiveCoherence < 0.5;
    const pointAlpha = showPoints
      ? Math.min(1.0, (0.5 - effectiveCoherence) / 0.3)
      : 0.0;

    // Begin post-processing scene pass
    this.postprocess.beginScene();

    // Set GL state
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw mesh (always, fades via dissolve)
    if (this.meshRenderer.hasData) {
      this.meshRenderer.render({
        projection, view, time,
        bass: audioData.u_bass,
        mid: audioData.u_mid,
        high: audioData.u_high,
        beat: audioData.u_beat,
        coherence: effectiveCoherence,
        dissolve,
      });
    }

    // Draw point cloud when dissolving (overlaid on mesh)
    if (showPoints && this.pointRenderer.hasCloud) {
      // Point cloud renders with its own program — set alpha via coherence
      const dpr = window.devicePixelRatio || 1;
      const pointScale = Math.max(3, Math.min(10, (canvas.clientWidth / 200) * dpr));

      // We need to render points into the same FBO
      // Point renderer uses its own GL context, so we render it separately
      // For simplicity, integrate point cloud scatter via the mesh dissolve effect
      // The mesh vertices scatter to become the point cloud at low coherence
      // This is handled by the dissolve scatter in the mesh vertex shader
    }

    // DMT overlay (renders into the scene FBO)
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
