"use client";

/**
 * The world's sound, synthesised rather than shipped.
 *
 * Every tone here is built from oscillators and filtered noise at run time. No
 * audio files: a construction-site loop and a music bed would be megabytes in
 * the repository and in the bundle, for something most readers will switch off.
 * The Web Audio API can make a wind bed and a handful of interface tones for
 * nothing, and they stay in tune with the palette rather than being borrowed.
 *
 * Two rules it holds itself to:
 *
 * - **Silent until asked.** Nothing plays until the reader turns it on. Browsers
 *   block audio before a gesture anyway, but the real reason is that a work tool
 *   that starts making noise on load is a work tool people close.
 * - **Quiet enough to leave on.** The ambient bed sits far under the interface
 *   tones, and the tones are short. This is meant to be background, not a game
 *   soundtrack fighting for attention.
 */

const STORAGE_KEY = "formaworld:audio";

/** Master level. Deliberately low — this plays under someone's actual work. */
const MASTER_GAIN = 0.5;
const AMBIENT_GAIN = 0.035;
const MUSIC_GAIN = 0.028;

export type WorldSound =
  | "select"
  | "district"
  | "focus"
  | "reward"
  | "confirm"
  | "error";

/**
 * A slow two-chord pad. Frequencies are an A-major-ish shape an octave apart,
 * chosen to sit under speech without beating against it.
 */
const CHORDS: number[][] = [
  [110.0, 164.81, 277.18],
  [98.0, 146.83, 246.94],
];
const CHORD_SECONDS = 24;

class WorldAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambient?: GainNode;
  private music?: GainNode;
  private voices: OscillatorNode[] = [];
  private noise?: AudioBufferSourceNode;
  private chordTimer?: ReturnType<typeof setInterval>;
  private chordIndex = 0;
  private enabled = false;
  private listeners = new Set<() => void>();

  isEnabled(): boolean {
    return this.enabled;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }

  /** Read the saved preference. Safe to call repeatedly and on the server. */
  hydrate() {
    if (typeof window === "undefined" || this.enabled) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // A blocked localStorage costs the reader their preference, which is not
      // worth failing over.
    }
    if (stored !== "on") return;

    // A browser refuses to start audio before the reader has touched the page,
    // so restoring the preference on load would build a graph into a suspended
    // context and leave it silent until they toggled it twice. The first real
    // gesture is what starts it.
    void this.enable();
    const resume = () => {
      void this.context?.resume().catch(() => undefined);
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }

  toggle(): void {
    if (this.enabled) this.disable();
    else void this.enable();
  }

  private persist(value: "on" | "off") {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // See hydrate.
    }
  }

  private async ensureContext(): Promise<AudioContext | undefined> {
    if (typeof window === "undefined") return undefined;
    if (!this.context) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return undefined;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.context.destination);
    }
    // A context created before a gesture starts suspended; resuming needs one.
    if (this.context.state === "suspended") await this.context.resume().catch(() => undefined);
    return this.context;
  }

  async enable(): Promise<void> {
    const context = await this.ensureContext();
    if (!context || !this.master) return;
    this.enabled = true;
    this.persist("on");
    this.startAmbient(context);
    this.startMusic(context);
    this.emit();
  }

  disable(): void {
    this.enabled = false;
    this.persist("off");
    this.stopAmbient();
    this.stopMusic();
    this.emit();
  }

  /**
   * The site bed: filtered noise with a slowly wandering cutoff. It reads as
   * wind over open ground rather than as a loop, because it never repeats.
   */
  private startAmbient(context: AudioContext) {
    if (this.noise || !this.master) return;
    const seconds = 4;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const channel = buffer.getChannelData(0);
    // Brown-ish noise: integrated white noise, which is far gentler than white.
    let last = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      channel[index] = last * 3.2;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    filter.Q.value = 0.6;

    // A slow sweep on the cutoff, so the bed breathes instead of sitting still.
    const sweep = context.createOscillator();
    sweep.frequency.value = 0.05;
    const sweepDepth = context.createGain();
    sweepDepth.gain.value = 140;
    sweep.connect(sweepDepth).connect(filter.frequency);
    sweep.start();

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(AMBIENT_GAIN, context.currentTime + 2.5);

    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.noise = source;
    this.ambient = gain;
  }

  private stopAmbient() {
    const context = this.context;
    if (!context || !this.noise || !this.ambient) return;
    const gain = this.ambient;
    const source = this.noise;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.6);
    window.setTimeout(() => { try { source.stop(); } catch { /* already stopped */ } }, 800);
    this.noise = undefined;
    this.ambient = undefined;
  }

  /** Three sustained voices, moved between two chords on a slow timer. */
  private startMusic(context: AudioContext) {
    if (this.voices.length > 0 || !this.master) return;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(MUSIC_GAIN, context.currentTime + 4);
    gain.connect(this.master);
    this.music = gain;

    this.voices = CHORDS[0].map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      // A few cents of detune per voice keeps the pad from sounding synthetic.
      oscillator.detune.value = (index - 1) * 6;
      const voiceGain = context.createGain();
      voiceGain.gain.value = index === 0 ? 0.9 : 0.45;
      oscillator.connect(voiceGain).connect(gain);
      oscillator.start();
      return oscillator;
    });

    this.chordTimer = setInterval(() => {
      if (!this.context || this.voices.length === 0) return;
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      const next = CHORDS[this.chordIndex];
      this.voices.forEach((voice, index) => {
        voice.frequency.linearRampToValueAtTime(next[index], this.context!.currentTime + 6);
      });
    }, CHORD_SECONDS * 1000);
  }

  private stopMusic() {
    const context = this.context;
    if (!context || !this.music) return;
    if (this.chordTimer) clearInterval(this.chordTimer);
    this.chordTimer = undefined;
    const gain = this.music;
    const voices = this.voices;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.8);
    window.setTimeout(() => {
      for (const voice of voices) { try { voice.stop(); } catch { /* already stopped */ } }
    }, 1000);
    this.voices = [];
    this.music = undefined;
  }

  /** One short tone. Ignored entirely while sound is off. */
  play(sound: WorldSound): void {
    if (!this.enabled || !this.context || !this.master) return;
    const context = this.context;
    const now = context.currentTime;

    if (sound === "focus") {
      // A filtered noise sweep, which reads as movement rather than as a note.
      const buffer = context.createBuffer(1, context.sampleRate * 0.4, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < channel.length; index += 1) {
        channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(1800, now + 0.32);
      filter.Q.value = 1.4;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(now);
      source.stop(now + 0.4);
      return;
    }

    const notes: Record<Exclude<WorldSound, "focus">, { steps: number[]; type: OscillatorType; length: number; level: number }> = {
      select: { steps: [660], type: "triangle", length: 0.07, level: 0.1 },
      district: { steps: [440, 660], type: "triangle", length: 0.1, level: 0.11 },
      reward: { steps: [660, 880, 1174], type: "sine", length: 0.11, level: 0.13 },
      confirm: { steps: [523, 659, 784], type: "sine", length: 0.14, level: 0.14 },
      error: { steps: [180, 140], type: "sawtooth", length: 0.16, level: 0.09 },
    };
    const spec = notes[sound as Exclude<WorldSound, "focus">];
    if (!spec) return;

    spec.steps.forEach((frequency, index) => {
      const start = now + index * spec.length * 0.7;
      const oscillator = context.createOscillator();
      oscillator.type = spec.type;
      oscillator.frequency.setValueAtTime(frequency, start);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(spec.level, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.length);
      // A gentle lowpass takes the edge off the square-ish harmonics.
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 3200;
      oscillator.connect(filter).connect(gain).connect(this.master!);
      oscillator.start(start);
      oscillator.stop(start + spec.length + 0.05);
    });
  }
}

export const worldAudio = new WorldAudio();
