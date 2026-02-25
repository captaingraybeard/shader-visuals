// Audio engine — Web Audio API + FFT + beat detection
// Supports two modes: mic input OR file playback
// 8 frequency bands + backward-compat bass/mid/high

export interface AudioData {
  u_band0: number; // sub-bass  20-60 Hz
  u_band1: number; // bass      60-250 Hz
  u_band2: number; // low-mid   250-500 Hz
  u_band3: number; // mid       500-2000 Hz
  u_band4: number; // upper-mid 2000-4000 Hz
  u_band5: number; // presence  4000-6000 Hz
  u_band6: number; // brilliance 6000-12000 Hz
  u_band7: number; // air       12000-20000 Hz
  u_bass: number;  // max(band0, band1)
  u_mid: number;   // max(band2, band3, band4)
  u_high: number;  // max(band5, band6, band7)
  u_beat: number;
}

// Band frequency boundaries in Hz
const BAND_EDGES = [20, 60, 250, 500, 2000, 4000, 6000, 12000, 20000] as const;

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

  // Smoothed 8-band values
  private smoothBands = new Float64Array(8);

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

    this.smoothBands.fill(0);
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

  getUniforms(): AudioData {
    const zero: AudioData = {
      u_band0: 0, u_band1: 0, u_band2: 0, u_band3: 0,
      u_band4: 0, u_band5: 0, u_band6: 0, u_band7: 0,
      u_bass: 0, u_mid: 0, u_high: 0, u_beat: 0,
    };
    if (!this.active || !this.analyser || !this.ctx) return zero;

    this.analyser.getByteFrequencyData(this.freqData);

    const sampleRate = this.ctx.sampleRate;
    const binCount = this.analyser.frequencyBinCount;
    const binSize = sampleRate / (binCount * 2);

    // Compute raw energy for each of the 8 bands
    const raw = new Float64Array(8);
    for (let b = 0; b < 8; b++) {
      const loHz = BAND_EDGES[b];
      const hiHz = BAND_EDGES[b + 1];
      const start = Math.floor(loHz / binSize);
      const end = Math.min(Math.floor(hiHz / binSize), binCount - 1);
      raw[b] = bandEnergy(this.freqData, start, end);
    }

    // Noise gate — ignore ambient room noise
    const totalRaw = (raw[0] + raw[1] + raw[2] + raw[3] + raw[4] + raw[5] + raw[6] + raw[7]) / 8;
    const NOISE_GATE = 0.08;
    const gated = totalRaw > NOISE_GATE;

    // Smooth each band independently
    for (let b = 0; b < 8; b++) {
      const val = gated ? raw[b] : 0;
      this.smoothBands[b] = this.smoothBands[b] * this.smooth + val * (1 - this.smooth);
    }

    // Beat detection off bass bands
    const bassEnergy = Math.max(this.smoothBands[0], this.smoothBands[1]);
    this.rollingAvg = this.rollingAvg * 0.95 + bassEnergy * 0.05;
    if (bassEnergy > this.rollingAvg * 1.5) {
      this.beat = 1.0;
    }
    this.beat *= 0.9;

    // Derived backward-compat values
    const u_bass = clamp(Math.max(this.smoothBands[0], this.smoothBands[1]));
    const u_mid = clamp(Math.max(this.smoothBands[2], this.smoothBands[3], this.smoothBands[4]));
    const u_high = clamp(Math.max(this.smoothBands[5], this.smoothBands[6], this.smoothBands[7]));

    return {
      u_band0: clamp(this.smoothBands[0]),
      u_band1: clamp(this.smoothBands[1]),
      u_band2: clamp(this.smoothBands[2]),
      u_band3: clamp(this.smoothBands[3]),
      u_band4: clamp(this.smoothBands[4]),
      u_band5: clamp(this.smoothBands[5]),
      u_band6: clamp(this.smoothBands[6]),
      u_band7: clamp(this.smoothBands[7]),
      u_bass,
      u_mid,
      u_high,
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
