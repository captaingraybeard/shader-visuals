// Audio engine — Web Audio API + FFT + beat detection
// Supports two modes: mic input OR file playback

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private freqData = new Uint8Array(0);
  private active = false;
  private failed = false;
  private mode: 'none' | 'mic' | 'file' = 'none';

  // Beat detection state
  private rollingAvg = 0;
  private beat = 0;

  // Smoothed output values
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothHigh = 0;

  // Smoothing factor
  private readonly smooth = 0.8;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      // @ts-expect-error - webkit prefix for iOS Safari
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 44100 });
    }
    return this.ctx;
  }

  private ensureAnalyser(): AnalyserNode {
    const ctx = this.ensureContext();
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.4;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return this.analyser;
  }

  async initMic(): Promise<void> {
    this.cleanup();
    try {
      const ctx = this.ensureContext();
      const analyser = this.ensureAnalyser();

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.source = ctx.createMediaStreamSource(this.stream);
      this.source.connect(analyser);
      this.mode = 'mic';
      this.active = true;
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      console.warn('AudioEngine: mic access denied or unavailable', e);
      this.failed = true;
      throw e;
    }
  }

  initFile(file: File): void {
    this.cleanup();
    const ctx = this.ensureContext();
    const analyser = this.ensureAnalyser();

    // Create audio element for playback
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.src = URL.createObjectURL(file);
    this.audioElement.loop = true;

    // Connect to analyser AND to destination (speakers)
    const source = ctx.createMediaElementSource(this.audioElement);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    this.source = source;
    this.mode = 'file';
    this.active = true;

    if (ctx.state === 'suspended') ctx.resume();
    this.audioElement.play();
  }

  private cleanup(): void {
    // Stop mic
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    // Stop audio element
    if (this.audioElement) {
      this.audioElement.pause();
      URL.revokeObjectURL(this.audioElement.src);
      this.audioElement = null;
    }
    // Disconnect source
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    // Disconnect analyser from destination (file mode connects it)
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch {}
    }

    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothHigh = 0;
    this.rollingAvg = 0;
    this.beat = 0;
    this.mode = 'none';
    this.active = false;
    this.failed = false;
  }

  stop(): void {
    this.cleanup();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.analyser = null;
      this.freqData = new Uint8Array(0);
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  get currentMode(): string {
    return this.mode;
  }

  get audioEl(): HTMLAudioElement | null {
    return this.audioElement;
  }

  togglePlayPause(): void {
    if (this.mode !== 'file' || !this.audioElement) return;
    if (this.audioElement.paused) {
      this.audioElement.play();
    } else {
      this.audioElement.pause();
    }
  }

  getUniforms(): { u_bass: number; u_mid: number; u_high: number; u_beat: number } {
    if (!this.active || !this.analyser || !this.ctx) {
      return { u_bass: 0, u_mid: 0, u_high: 0, u_beat: 0 };
    }

    this.analyser.getByteFrequencyData(this.freqData);

    const sampleRate = this.ctx.sampleRate;
    const binCount = this.analyser.frequencyBinCount;
    const binSize = sampleRate / (binCount * 2);

    const bassStart = Math.floor(20 / binSize);
    const bassEnd = Math.min(Math.floor(250 / binSize), binCount - 1);
    const midStart = bassEnd + 1;
    const midEnd = Math.min(Math.floor(2000 / binSize), binCount - 1);
    const highStart = midEnd + 1;
    const highEnd = Math.min(Math.floor(16000 / binSize), binCount - 1);

    const rawBass = bandEnergy(this.freqData, bassStart, bassEnd);
    const rawMid = bandEnergy(this.freqData, midStart, midEnd);
    const rawHigh = bandEnergy(this.freqData, highStart, highEnd);

    this.smoothBass = this.smoothBass * this.smooth + rawBass * (1 - this.smooth);
    this.smoothMid = this.smoothMid * this.smooth + rawMid * (1 - this.smooth);
    this.smoothHigh = this.smoothHigh * this.smooth + rawHigh * (1 - this.smooth);

    this.rollingAvg = this.rollingAvg * 0.95 + this.smoothBass * 0.05;
    if (this.smoothBass > this.rollingAvg * 1.5) {
      this.beat = 1.0;
    }
    this.beat *= 0.9;

    return {
      u_bass: clamp(this.smoothBass),
      u_mid: clamp(this.smoothMid),
      u_high: clamp(this.smoothHigh),
      u_beat: clamp(this.beat),
    };
  }
}

function bandEnergy(data: Uint8Array, start: number, end: number): number {
  if (start > end || start >= data.length) return 0;
  let sum = 0;
  const clampedEnd = Math.min(end, data.length - 1);
  for (let i = start; i <= clampedEnd; i++) {
    sum += data[i];
  }
  return sum / ((clampedEnd - start + 1) * 255);
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
