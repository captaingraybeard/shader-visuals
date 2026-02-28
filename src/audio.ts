// Audio engine — Web Audio API + FFT + beat detection
// Supports three modes: mic input, file playback, or generative tone synthesis
// 8 frequency bands + backward-compat bass/mid/high

// ── Generative Tone Synthesis ──
// Creates creatures from nothing using cymatics principles:
// - Fundamental tone defines scale/boundary
// - Integer harmonics define complexity (more = more creature-like)
// - Golden ratio (φ = 1.618) harmonic breaks symmetry → organic form
// - Beating pair (close frequencies) creates breathing/pulsation → apparent life
// - All routed through FFT analyser so shaders react to the generated frequencies

export interface TonePreset {
  name: string;
  fundamental: number;       // Hz
  harmonics: number[];       // multipliers (e.g. [2, 3, 4] = integer harmonics)
  harmonicGains: number[];   // gain per harmonic (0-1)
  harmonicTypes?: OscillatorType[];  // per-voice waveform (parallel to harmonics)
  subHarmonics?: number[];   // sub-harmonic multipliers (e.g. [0.5, 0.333] = octave below, fifth below)
  subHarmonicGains?: number[]; // gain per sub-harmonic
  subHarmonicTypes?: OscillatorType[]; // waveform per sub-harmonic
  goldenRatio: boolean;      // add φ×fundamental
  goldenGain: number;        // gain of golden ratio tone
  goldenType?: OscillatorType; // waveform for golden ratio tones
  beatFreq: number;          // Hz offset for beating (0 = no beat)
  beatGain: number;          // gain of beating oscillator
  lfoRate: number;           // Hz — slow modulation of amplitudes
  lfoDepth: number;          // 0-1 — how much LFO affects gains
  detuneCents?: number;      // detune all oscillators by this many cents
}

export const TONE_PRESETS: TonePreset[] = [
  {
    name: 'Embryo',
    fundamental: 40,
    harmonics: [2, 3, 5],
    harmonicGains: [0.6, 0.4, 0.2],
    harmonicTypes: ['sine', 'sine', 'triangle'],
    subHarmonics: [0.5],
    subHarmonicGains: [0.4],
    subHarmonicTypes: ['sawtooth'],
    goldenRatio: true,
    goldenGain: 0.35,
    goldenType: 'triangle',
    beatFreq: 2.5,
    beatGain: 0.5,
    lfoRate: 0.15,
    lfoDepth: 0.6,
  },
  {
    name: 'Leviathan',
    fundamental: 28,
    harmonics: [2, 3, 4, 7],
    harmonicGains: [0.7, 0.5, 0.3, 0.15],
    harmonicTypes: ['sine', 'sine', 'square', 'square'],
    subHarmonics: [0.5, 0.333],
    subHarmonicGains: [0.6, 0.4],
    subHarmonicTypes: ['sawtooth', 'sawtooth'],
    goldenRatio: true,
    goldenGain: 0.4,
    goldenType: 'triangle',
    beatFreq: 1.5,
    beatGain: 0.6,
    lfoRate: 0.08,
    lfoDepth: 0.8,
  },
  {
    name: 'Insect',
    fundamental: 110,
    harmonics: [2, 3, 5, 8, 13],
    harmonicGains: [0.5, 0.4, 0.35, 0.25, 0.15],
    harmonicTypes: ['sine', 'square', 'square', 'square', 'sine'],
    goldenRatio: true,
    goldenGain: 0.3,
    goldenType: 'triangle',
    beatFreq: 5,
    beatGain: 0.4,
    lfoRate: 0.4,
    lfoDepth: 0.5,
    detuneCents: 3,
  },
  {
    name: 'Jellyfish',
    fundamental: 55,
    harmonics: [2, 4],
    harmonicGains: [0.5, 0.25],
    subHarmonics: [0.5],
    subHarmonicGains: [0.35],
    subHarmonicTypes: ['sawtooth'],
    goldenRatio: true,
    goldenGain: 0.5,
    goldenType: 'triangle',
    beatFreq: 0.8,
    beatGain: 0.7,
    lfoRate: 0.05,
    lfoDepth: 0.9,
  },
  {
    name: 'Swarm',
    fundamental: 80,
    harmonics: [2, 3, 5, 7, 11],
    harmonicGains: [0.5, 0.45, 0.4, 0.3, 0.2],
    harmonicTypes: ['sine', 'sine', 'square', 'square', 'square'],
    goldenRatio: true,
    goldenGain: 0.25,
    beatFreq: 7,
    beatGain: 0.35,
    lfoRate: 0.6,
    lfoDepth: 0.4,
    detuneCents: 5,
  },
  {
    name: 'Chladni',
    fundamental: 60,
    harmonics: [2, 3, 4, 5, 6],
    harmonicGains: [0.6, 0.5, 0.4, 0.3, 0.2],
    goldenRatio: false,
    goldenGain: 0,
    beatFreq: 3,
    beatGain: 0.45,
    lfoRate: 0.2,
    lfoDepth: 0.7,
  },
  // ── Fibonacci — organic interference patterns ──
  {
    name: 'Fibonacci',
    fundamental: 55,
    harmonics: [1, 2, 3, 5, 8, 13, 21],
    harmonicGains: [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    harmonicTypes: ['sine', 'sine', 'triangle', 'triangle', 'sine', 'sine', 'sine'],
    goldenRatio: true,
    goldenGain: 0.35,
    goldenType: 'triangle',
    beatFreq: 2,
    beatGain: 0.4,
    lfoRate: 0.12,
    lfoDepth: 0.6,
  },
  // ── Mycelium — very low, sub-harmonics, spreading network ──
  {
    name: 'Mycelium',
    fundamental: 25,
    harmonics: [2, 3],
    harmonicGains: [0.3, 0.15],
    subHarmonics: [0.5, 0.333, 0.25],
    subHarmonicGains: [0.6, 0.5, 0.35],
    subHarmonicTypes: ['sawtooth', 'sawtooth', 'sawtooth'],
    goldenRatio: true,
    goldenGain: 0.2,
    goldenType: 'triangle',
    beatFreq: 0.5,
    beatGain: 0.3,
    lfoRate: 0.03,
    lfoDepth: 0.9,
  },
  // ── Serpent — sliding between harmonics, sinuous ──
  {
    name: 'Serpent',
    fundamental: 65,
    harmonics: [2, 3, 4, 5],
    harmonicGains: [0.6, 0.5, 0.35, 0.2],
    harmonicTypes: ['sine', 'triangle', 'sine', 'triangle'],
    subHarmonics: [0.5],
    subHarmonicGains: [0.4],
    subHarmonicTypes: ['sawtooth'],
    goldenRatio: true,
    goldenGain: 0.3,
    goldenType: 'triangle',
    beatFreq: 1.2,
    beatGain: 0.4,
    lfoRate: 0.1,
    lfoDepth: 0.7,
    detuneCents: 12,
  },
  // ── Crystal — pure integer harmonics, geometric ──
  {
    name: 'Crystal',
    fundamental: 220,
    harmonics: [2, 3, 4, 5, 6, 7, 8],
    harmonicGains: [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
    harmonicTypes: ['sine', 'sine', 'sine', 'sine', 'sine', 'sine', 'sine'],
    goldenRatio: false,
    goldenGain: 0,
    beatFreq: 4,
    beatGain: 0.3,
    lfoRate: 0.25,
    lfoDepth: 0.3,
  },
  // ── Void — only golden ratio + sub-harmonics, maximally alien ──
  {
    name: 'Void',
    fundamental: 30,
    harmonics: [],
    harmonicGains: [],
    subHarmonics: [0.5, 0.333, 0.25],
    subHarmonicGains: [0.7, 0.5, 0.35],
    subHarmonicTypes: ['sawtooth', 'sawtooth', 'sawtooth'],
    goldenRatio: true,
    goldenGain: 0.6,
    goldenType: 'triangle',
    beatFreq: 0.3,
    beatGain: 0.5,
    lfoRate: 0.04,
    lfoDepth: 0.95,
  },
  // ── Heartbeat — 50Hz, strong beating at 1Hz ──
  {
    name: 'Heartbeat',
    fundamental: 50,
    harmonics: [2],
    harmonicGains: [0.3],
    subHarmonics: [0.5],
    subHarmonicGains: [0.5],
    subHarmonicTypes: ['sawtooth'],
    goldenRatio: false,
    goldenGain: 0,
    beatFreq: 1,
    beatGain: 0.8,
    lfoRate: 0.5,
    lfoDepth: 0.9,
  },
  // ── Flock — many close frequencies, shimmering chorus ──
  {
    name: 'Flock',
    fundamental: 90,
    harmonics: [2, 3, 4, 5],
    harmonicGains: [0.5, 0.4, 0.3, 0.2],
    harmonicTypes: ['sine', 'sine', 'triangle', 'triangle'],
    goldenRatio: true,
    goldenGain: 0.2,
    beatFreq: 1.5,
    beatGain: 0.4,
    lfoRate: 0.3,
    lfoDepth: 0.5,
    detuneCents: 8,
  },
];

const PHI = 1.6180339887;

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
  private mode: 'none' | 'mic' | 'file' | 'tone' = 'none';

  // Beat detection state
  private rollingAvg = 0;
  private beat = 0;

  // Smoothed 8-band values
  private smoothBands = new Float64Array(8);

  // Smoothing factor
  private readonly smooth = 0.8;

  // ── Tone synthesis state ──
  private toneOscillators: OscillatorNode[] = [];
  private toneGains: GainNode[] = [];
  private toneLfo: OscillatorNode | null = null;
  private toneLfoGain: GainNode | null = null;
  private toneMaster: GainNode | null = null;
  private currentPreset: TonePreset | null = null;

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

  /** Start generative tone synthesis — creates a creature from sound */
  initTone(preset: TonePreset): void {
    this.cleanup();
    const ctx = this.ensureContext();
    const analyser = this.ensureAnalyser();

    // Master gain → analyser → destination
    this.toneMaster = ctx.createGain();
    this.toneMaster.gain.value = 0.3; // keep volume sane
    this.toneMaster.connect(analyser);
    analyser.connect(ctx.destination);

    const f0 = preset.fundamental;
    const now = ctx.currentTime;

    // LFO for amplitude modulation (breathing)
    if (preset.lfoRate > 0 && preset.lfoDepth > 0) {
      this.toneLfo = ctx.createOscillator();
      this.toneLfo.type = 'sine';
      this.toneLfo.frequency.value = preset.lfoRate;

      this.toneLfoGain = ctx.createGain();
      // LFO output range: -lfoDepth to +lfoDepth
      this.toneLfoGain.gain.value = preset.lfoDepth * 0.5;
      this.toneLfo.connect(this.toneLfoGain);
      this.toneLfo.start(now);
    }

    const detune = preset.detuneCents ?? 0;

    // Helper: create an oscillator at a frequency with a gain and waveform
    const makeOsc = (freq: number, gain: number, type: OscillatorType = 'sine'): void => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      if (detune !== 0) osc.detune.value = detune;

      const g = ctx.createGain();
      g.gain.value = gain;

      // Connect LFO to modulate this voice's gain
      if (this.toneLfoGain) {
        this.toneLfoGain.connect(g.gain);
      }

      osc.connect(g);
      g.connect(this.toneMaster!);
      osc.start(now);

      this.toneOscillators.push(osc);
      this.toneGains.push(g);
    };

    // 1. Fundamental
    makeOsc(f0, 0.8);

    // 2. Integer harmonics — per-voice waveform support
    for (let i = 0; i < preset.harmonics.length; i++) {
      const mult = preset.harmonics[i];
      const gain = preset.harmonicGains[i] ?? 0.3;
      const type = preset.harmonicTypes?.[i] ?? 'sine';
      makeOsc(f0 * mult, gain, type);
    }

    // 3. Sub-harmonics — deep undertones below the fundamental
    if (preset.subHarmonics) {
      for (let i = 0; i < preset.subHarmonics.length; i++) {
        const mult = preset.subHarmonics[i];
        const gain = preset.subHarmonicGains?.[i] ?? 0.3;
        const type = preset.subHarmonicTypes?.[i] ?? 'sawtooth';
        makeOsc(f0 * mult, gain, type);
      }
    }

    // 4. Golden ratio harmonic — breaks symmetry, creates organic form
    if (preset.goldenRatio && preset.goldenGain > 0) {
      const gType = preset.goldenType ?? 'sine';
      makeOsc(f0 * PHI, preset.goldenGain, gType);
      // Also add φ² for deeper quasi-periodicity
      makeOsc(f0 * PHI * PHI, preset.goldenGain * 0.4, gType);
    }

    // 5. Beating pair — two close frequencies create pulsation (apparent life)
    if (preset.beatFreq > 0 && preset.beatGain > 0) {
      makeOsc(f0 + preset.beatFreq, preset.beatGain);
      // The interference between f0 and f0+beatFreq creates an envelope
      // at beatFreq Hz — this IS the creature's heartbeat
    }

    this.currentPreset = preset;
    this.mode = 'tone';
    this.active = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  /** Change the fundamental frequency while keeping the same preset shape */
  setToneFundamental(freq: number): void {
    if (this.mode !== 'tone' || !this.currentPreset) return;
    // Rebuild with new fundamental
    const preset = { ...this.currentPreset, fundamental: freq };
    this.initTone(preset);
  }

  /** Set master volume for tone mode (0-1) */
  setToneVolume(vol: number): void {
    if (this.toneMaster) {
      this.toneMaster.gain.value = Math.max(0, Math.min(1, vol)) * 0.3;
    }
  }

  get tonePreset(): TonePreset | null {
    return this.currentPreset;
  }

  private cleanupTone(): void {
    for (const osc of this.toneOscillators) {
      try { osc.stop(); osc.disconnect(); } catch {}
    }
    this.toneOscillators = [];
    for (const g of this.toneGains) {
      try { g.disconnect(); } catch {}
    }
    this.toneGains = [];
    if (this.toneLfo) {
      try { this.toneLfo.stop(); this.toneLfo.disconnect(); } catch {}
      this.toneLfo = null;
    }
    if (this.toneLfoGain) {
      try { this.toneLfoGain.disconnect(); } catch {}
      this.toneLfoGain = null;
    }
    if (this.toneMaster) {
      try { this.toneMaster.disconnect(); } catch {}
      this.toneMaster = null;
    }
    this.currentPreset = null;
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
    // Stop tone synthesis
    this.cleanupTone();
    // Disconnect analyser from destination (file/tone mode connects it)
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
