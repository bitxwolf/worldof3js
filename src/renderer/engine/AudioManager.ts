/**
 * Resilient Web Audio manager for Orbis Studio.
 * Features:
 * - Lazy Web Audio Context creation with graceful degradation in headless/mock environments
 * - Autoplay policy compliance with gesture unlocking (pointerdown, keydown)
 * - Procedural synthesized sound effects (interact chime, select pop, dialogue blip, lightning thunder)
 * - Complete error suppression: audio playback failures never crash the renderer or game loop
 */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;
  private gestureUnlocked: boolean = false;
  private unlockHandler: (() => void) | null = null;
  private cachedLightningBuffer: AudioBuffer | null = null;

  private constructor() {
    this.setupGestureUnlock();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private initContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, ctx.currentTime);
      masterGain.connect(ctx.destination);

      this.ctx = ctx;
      this.masterGain = masterGain;
      return ctx;
    } catch {
      return null;
    }
  }

  private removeGestureListeners(): void {
    if (this.unlockHandler && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.unlockHandler);
      window.removeEventListener('keydown', this.unlockHandler);
      window.removeEventListener('click', this.unlockHandler);
      this.unlockHandler = null;
    }
  }

  private setupGestureUnlock(): void {
    if (typeof window === 'undefined') return;

    this.unlockHandler = () => {
      if (this.gestureUnlocked) return;
      try {
        const ctx = this.initContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().then(() => {
            this.gestureUnlocked = true;
            this.removeGestureListeners();
          }).catch(() => {
            // Keep listeners active so a subsequent user gesture can retry unlocking
          });
        } else {
          this.gestureUnlocked = true;
          this.removeGestureListeners();
        }
      } catch {
        // Safe fallback
      }
    };

    window.addEventListener('pointerdown', this.unlockHandler, { passive: true });
    window.addEventListener('keydown', this.unlockHandler, { passive: true });
    window.addEventListener('click', this.unlockHandler, { passive: true });
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
      }
    } catch {
      // ignore
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMasterVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.5));
    try {
      if (this.masterGain && this.ctx && !this.isMuted) {
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      }
    } catch {
      // ignore
    }
  }

  public getMasterVolume(): number {
    return this.volume;
  }

  /**
   * Procedural UI interaction chime (two harmonized sine tones).
   */
  public playInteract(): void {
    if (this.isMuted) return;
    try {
      const ctx = this.initContext();
      if (!ctx || ctx.state === 'suspended' || !this.masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const t = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, t + 0.08); // E5

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.18);
    } catch {
      // Non-fatal audio fallback
    }
  }

  /**
   * Procedural reticle / tool selection pop.
   */
  public playSelect(): void {
    if (this.isMuted) return;
    try {
      const ctx = this.initContext();
      if (!ctx || ctx.state === 'suspended' || !this.masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const t = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t); // A4
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.05); // A5

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.08);
    } catch {
      // Non-fatal audio fallback
    }
  }

  /**
   * Procedural NPC dialogue speech blip.
   */
  public playDialogue(): void {
    if (this.isMuted) return;
    try {
      const ctx = this.initContext();
      if (!ctx || ctx.state === 'suspended' || !this.masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const t = ctx.currentTime;
      osc.type = 'sine';
      const baseFreq = 260 + Math.random() * 80;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.setValueAtTime(baseFreq * 1.15, t + 0.04);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.09);
    } catch {
      // Non-fatal audio fallback
    }
  }

  /**
   * Procedural thunder clap & rumble for storm weather lightning.
   */
  public playLightning(intensity = 1.0): void {
    if (this.isMuted) return;
    try {
      const ctx = this.initContext();
      if (!ctx || ctx.state === 'suspended' || !this.masterGain) return;

      if (!this.cachedLightningBuffer || this.cachedLightningBuffer.sampleRate !== ctx.sampleRate) {
        const bufferSize = Math.floor(ctx.sampleRate * 0.8); // 800ms noise burst
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.25));
        }
        this.cachedLightningBuffer = buffer;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = this.cachedLightningBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.7);

      const gain = ctx.createGain();
      const t = ctx.currentTime;
      const vol = Math.max(0.1, Math.min(1.0, intensity)) * 0.35;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.78);
    } catch {
      // Non-fatal audio fallback
    }
  }

  public dispose(): void {
    this.removeGestureListeners();
    this.cachedLightningBuffer = null;

    try {
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close().catch(() => {});
      }
    } catch {
      // ignore
    }

    this.ctx = null;
    this.masterGain = null;
    AudioManager.instance = null;
  }
}
