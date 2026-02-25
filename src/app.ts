import { AudioEngine } from './audio';
import { Renderer } from './renderer';
import { UI } from './ui';
import { generateShaderWithRetry } from './llm';
import { presets } from './presets';
import defaultShader from '../shaders/default.frag?raw';
import type { AudioUniforms } from './types';

export class App {
  private audio: AudioEngine;
  private renderer: Renderer;
  private ui: UI;
  private intensity = 0.5;
  private startTime = 0;
  private running = false;

  constructor() {
    this.audio = new AudioEngine();
    this.renderer = new Renderer();
    this.ui = new UI();
  }

  async init(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas element not found');

    // Init renderer with default shader
    this.renderer.init(canvas, defaultShader);
    this.renderer.onError = (msg) => this.ui.showToast(msg, 4000);

    // Init UI
    this.ui.init();
    this.wireUI();

    // Load saved intensity
    const savedIntensity = localStorage.getItem('shader-visuals-intensity');
    if (savedIntensity !== null) {
      this.intensity = parseFloat(savedIntensity);
    }

    // Load first preset as initial shader
    if (presets.length > 0) {
      this.renderer.crossfadeTo(presets[0].source, 300);
    }

    // Start render loop
    this.startTime = performance.now() / 1000;
    this.running = true;
    this.loop();

    // Register service worker
    this.registerSW();
  }

  private wireUI(): void {
    this.ui.onGenerate = async (scene, vibe) => {
      const apiKey = localStorage.getItem('shader-visuals-api-key') || '';
      if (!apiKey) {
        this.ui.showToast('Set your API key in settings first', 3000);
        return;
      }
      if (!scene.trim() && !vibe.trim()) {
        this.ui.showToast('Enter a scene or vibe first', 2000);
        return;
      }

      this.ui.setLoading(true);
      try {
        const glsl = await generateShaderWithRetry(
          scene,
          vibe,
          apiKey,
          undefined
        );

        const success = this.renderer.crossfadeTo(glsl);
        if (!success) {
          // Crossfade failed (compile error), retry with error
          this.ui.showToast('Shader had errors, retrying...', 2000);
          try {
            const glsl2 = await generateShaderWithRetry(
              scene,
              vibe,
              apiKey,
              'Previous shader failed to compile. Please output simpler, valid GLSL.'
            );
            const success2 = this.renderer.crossfadeTo(glsl2);
            if (!success2) {
              this.ui.showToast('Shader failed to compile. Using fallback.', 3000);
              this.renderer.crossfadeTo(defaultShader);
            }
          } catch (e) {
            this.ui.showToast(`Retry failed: ${(e as Error).message}`, 3000);
          }
        }
      } catch (e) {
        this.ui.showToast(`Generation failed: ${(e as Error).message}`, 4000);
      } finally {
        this.ui.setLoading(false);
      }
    };

    this.ui.onPresetSelect = (name) => {
      const preset = presets.find((p) => p.name === name);
      if (preset) {
        this.renderer.crossfadeTo(preset.source);
      }
    };

    this.ui.onIntensityChange = (value) => {
      this.intensity = value;
      localStorage.setItem('shader-visuals-intensity', String(value));
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

  private loop = (): void => {
    if (!this.running) return;

    const audioData = this.audio.getUniforms();
    const now = performance.now() / 1000;

    const uniforms: AudioUniforms = {
      u_time: now - this.startTime,
      u_bass: audioData.u_bass,
      u_mid: audioData.u_mid,
      u_high: audioData.u_high,
      u_beat: audioData.u_beat,
      u_intensity: this.intensity,
      u_resolution: [window.innerWidth, window.innerHeight],
    };

    this.renderer.render(uniforms);
    requestAnimationFrame(this.loop);
  };

  private async registerSW(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const base = import.meta.env.BASE_URL || '/';
        await navigator.serviceWorker.register(base + 'sw.js');
      } catch {
        // Service worker registration failed — not critical
      }
    }
  }
}
