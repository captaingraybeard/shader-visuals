// Audio engine — Web Audio API + FFT + beat detection

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private freqData = new Uint8Array(0);
  private active = false;
  private failed = false;

  // Beat detection state
  private rollingAvg = 0;
  private beat = 0;

  // Smoothed output values
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothHigh = 0;

  // Smoothing factor (0 = no smoothing, 1 = frozen)
  private readonly smooth = 0.8;

  async init(): Promise<void> {
    try {
      // Create AudioContext FIRST with playback category so iOS doesn't kill background music
      // @ts-expect-error - webkit prefix for iOS Safari
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({
        // Tell iOS this is for monitoring, not recording — allows background music to continue
        sampleRate: 44100,
      });

      // On iOS, we need to set the audio session to allow mixing
      // getUserMedia with audio constraints that hint at monitoring use
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.4;
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) {
      console.warn('AudioEngine: mic access denied or unavailable', e);
      this.failed = true;
      throw e;
    }
  }

  start(): void {
    if (this.failed || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.active = true;
  }

  stop(): void {
    this.active = false;
    // Stop the mic stream tracks to release the mic and let iOS resume normal audio
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.analyser = null;
    this.freqData = new Uint8Array(0);
    this.smoothBass = 0;
    this.smoothMid = 0;
    this.smoothHigh = 0;
    this.rollingAvg = 0;
    this.beat = 0;
  }

  get isActive(): boolean {
    return this.active;
  }

  getUniforms(): { u_bass: number; u_mid: number; u_high: number; u_beat: number } {
    if (!this.active || !this.analyser || !this.ctx) {
      return { u_bass: 0, u_mid: 0, u_high: 0, u_beat: 0 };
    }

    this.analyser.getByteFrequencyData(this.freqData);

    const sampleRate = this.ctx.sampleRate;
    const binCount = this.analyser.frequencyBinCount;
    const binSize = sampleRate / (binCount * 2); // Hz per bin

    // Convert Hz to bin indices
    const bassStart = Math.floor(20 / binSize);
    const bassEnd = Math.min(Math.floor(250 / binSize), binCount - 1);
    const midStart = bassEnd + 1;
    const midEnd = Math.min(Math.floor(2000 / binSize), binCount - 1);
    const highStart = midEnd + 1;
    const highEnd = Math.min(Math.floor(16000 / binSize), binCount - 1);

    const rawBass = bandEnergy(this.freqData, bassStart, bassEnd);
    const rawMid = bandEnergy(this.freqData, midStart, midEnd);
    const rawHigh = bandEnergy(this.freqData, highStart, highEnd);

    // Smooth values to reduce jitter
    this.smoothBass = this.smoothBass * this.smooth + rawBass * (1 - this.smooth);
    this.smoothMid = this.smoothMid * this.smooth + rawMid * (1 - this.smooth);
    this.smoothHigh = this.smoothHigh * this.smooth + rawHigh * (1 - this.smooth);

    // Beat detection
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

/** Average energy in a frequency band, normalized 0-1 from byte data (0-255). */
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
