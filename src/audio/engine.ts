/**
 * Procedural sound for NINES, on the raw Web Audio API (see DECISIONS D-003).
 *
 * Channels: ui, sim, alerts, music -> master -> compressor -> destination.
 * Every one-shot gets slight pitch/timing variation. Voices are capped so bursts never crackle.
 */
import type { AudioSettings } from "@/game/db";

type Channel = "ui" | "sim" | "alerts" | "music";

const MAX_VOICES = 28;
const BLIPS_PER_SECOND = 12;

function jitter(v: number, pct = 0.03): number {
  return v * (1 + (Math.random() * 2 - 1) * pct);
}

/** Map a latency (seconds) to a blip frequency: fast = bright and high, slow = low and dragging. */
export function latencyToHz(latencyS: number): number {
  const lo = Math.log10(0.001); // 1ms
  const hi = Math.log10(5); // 5s
  const x = Math.min(1, Math.max(0, (Math.log10(Math.max(latencyS, 1e-4)) - lo) / (hi - lo)));
  // 1760 Hz at 1ms down to 98 Hz at 5s, on a log (musical) scale
  return 1760 * Math.pow(98 / 1760, x);
}

const PENTATONIC_MINOR = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

export interface Mood {
  /** MIDI root note. */
  root: number;
  scale: "pentatonic" | "dorian";
  /** 0 calm .. 1 everything is on fire. */
  intensity: number;
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class NinesAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  private ch!: Record<Channel, GainNode>;
  private voices = 0;
  private blipTimes: number[] = [];
  private settings: AudioSettings | null = null;
  private noiseBuf: AudioBuffer | null = null;

  // continuous voices
  private hum: { a: OscillatorNode; b: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private alarmTimer: ReturnType<typeof setInterval> | null = null;
  private music: { drone: OscillatorNode[]; g: GainNode; f: BiquadFilterNode; timer: ReturnType<typeof setTimeout> | null; mood: Mood } | null = null;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Must be called from a user gesture (autoplay policy). Safe to call repeatedly. */
  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.2;
      this.master = this.ctx.createGain();
      this.master.connect(this.comp).connect(this.ctx.destination);
      this.ch = {
        ui: this.ctx.createGain(),
        sim: this.ctx.createGain(),
        alerts: this.ctx.createGain(),
        music: this.ctx.createGain(),
      };
      for (const g of Object.values(this.ch)) g.connect(this.master);
      this.noiseBuf = this.makeNoise();
      if (this.settings) this.apply(this.settings);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  apply(s: AudioSettings): void {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03);
    this.ch.ui.gain.setTargetAtTime(s.ui, t, 0.03);
    this.ch.sim.gain.setTargetAtTime(s.sim, t, 0.03);
    this.ch.alerts.gain.setTargetAtTime(s.alerts, t, 0.03);
    this.ch.music.gain.setTargetAtTime(s.music, t, 0.05);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private voice(): boolean {
    if (!this.ctx || this.ctx.state !== "running") return false;
    if (this.settings?.muted) return false;
    if (this.voices >= MAX_VOICES) return false;
    this.voices++;
    return true;
  }

  private release(node: AudioScheduledSourceNode): void {
    node.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      node.disconnect();
    };
  }

  /** A shaped oscillator one-shot. */
  private tone(opts: {
    ch: Channel;
    type: OscillatorType;
    hz: number;
    hzEnd?: number;
    attack?: number;
    decay: number;
    gain: number;
    delay?: number;
    filterHz?: number;
  }): void {
    if (!this.voice()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005 + (opts.delay ?? 0) + Math.random() * 0.006;
    const o = ctx.createOscillator();
    o.type = opts.type;
    o.frequency.setValueAtTime(opts.hz, t);
    if (opts.hzEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.hzEnd), t + opts.decay);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + opts.decay);
    let last: AudioNode = g;
    if (opts.filterHz) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = opts.filterHz;
      g.connect(f);
      last = f;
    }
    o.connect(g);
    last.connect(this.ch[opts.ch]);
    this.release(o);
    o.start(t);
    o.stop(t + a + opts.decay + 0.05);
  }

  private noise(opts: { ch: Channel; decay: number; gain: number; hz: number; q?: number; type?: BiquadFilterType; delay?: number }): void {
    if (!this.voice() || !this.noiseBuf) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005 + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = jitter(1, 0.1);
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.value = jitter(opts.hz, 0.05);
    f.Q.value = opts.q ?? 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay);
    src.connect(f).connect(g).connect(this.ch[opts.ch]);
    this.release(src);
    src.start(t, Math.random() * 0.3);
    src.stop(t + opts.decay + 0.02);
  }

  // ---------------------------------------------------------------- UI

  // "Dusk" sound: soft, rounded, low-passed. Pleasant to hear a thousand times; meaning carried by pitch and shape.

  /** A soft wooden tap. */
  tick(): void {
    this.tone({ ch: "ui", type: "sine", hz: jitter(1150, 0.04), hzEnd: 900, attack: 0.002, decay: 0.035, gain: 0.05, filterHz: 2600 });
  }

  select(): void {
    this.tone({ ch: "ui", type: "sine", hz: jitter(660, 0.02), attack: 0.006, decay: 0.12, gain: 0.07, filterHz: 2200 });
  }

  /** Placing something heavy: low thump with a click on top. */
  thunk(): void {
    this.tone({ ch: "ui", type: "sine", hz: jitter(150), hzEnd: 60, decay: 0.2, gain: 0.3 });
    this.noise({ ch: "ui", decay: 0.04, gain: 0.06, hz: 1200, q: 0.8, type: "lowpass" });
  }

  confirm(): void {
    this.tone({ ch: "ui", type: "sine", hz: midiHz(76), attack: 0.008, decay: 0.22, gain: 0.08, filterHz: 2400 });
    this.tone({ ch: "ui", type: "sine", hz: midiHz(83), attack: 0.008, decay: 0.32, gain: 0.07, filterHz: 2400, delay: 0.08 });
  }

  error(): void {
    this.tone({ ch: "ui", type: "triangle", hz: midiHz(52), decay: 0.22, gain: 0.08, filterHz: 700 });
    this.tone({ ch: "ui", type: "triangle", hz: midiHz(47), decay: 0.3, gain: 0.07, filterHz: 600, delay: 0.1 });
  }

  /** Locking in a prediction: a latch closing. */
  latch(): void {
    this.noise({ ch: "ui", decay: 0.04, gain: 0.07, hz: 1600, q: 1.2, type: "lowpass" });
    this.tone({ ch: "ui", type: "sine", hz: jitter(220), hzEnd: 185, decay: 0.16, gain: 0.22 });
  }

  /** Reveal sting. `surprise` 0 = you called it, 1 = confidently wrong. */
  reveal(surprise: number): void {
    if (surprise <= 0) {
      [0, 4, 7, 12].forEach((s, i) => this.tone({ ch: "ui", type: "sine", hz: midiHz(72 + s), attack: 0.01, decay: 0.5, gain: 0.07, filterHz: 3000, delay: i * 0.07 }));
    } else {
      this.tone({ ch: "alerts", type: "triangle", hz: 220, hzEnd: 120 - 30 * surprise, decay: 0.55 + 0.4 * surprise, gain: 0.08 + 0.06 * surprise, filterHz: 800 });
      this.noise({ ch: "alerts", decay: 0.3, gain: 0.06 * surprise, hz: 300, q: 0.7, type: "lowpass" });
    }
  }

  whoosh(): void {
    this.noise({ ch: "ui", decay: 0.45, gain: 0.05, hz: 700, q: 0.4, type: "lowpass" });
  }

  // ---------------------------------------------------------------- simulation

  /** A request finishing. Pitch tracks latency; rate-limited so load never turns into noise. */
  blip(latencyS: number, failed = false): void {
    if (!this.ctx) return;
    const now = performance.now();
    this.blipTimes = this.blipTimes.filter((t) => now - t < 1000);
    if (this.blipTimes.length >= BLIPS_PER_SECOND) return;
    this.blipTimes.push(now);
    if (failed) {
      this.noise({ ch: "sim", decay: 0.06, gain: 0.1, hz: 300, q: 4 });
      return;
    }
    const hz = jitter(latencyToHz(latencyS), 0.02);
    const slow = Math.min(1, Math.max(0, Math.log10(latencyS * 1000) / 3.7));
    this.tone({ ch: "sim", type: "sine", hz, hzEnd: hz * (1 - 0.25 * slow), decay: 0.04 + 0.22 * slow, gain: 0.06 });
  }

  /** Continuous hum that rises with utilization (0..1). */
  setLoad(util: number): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const u = Math.max(0, Math.min(1.2, util));
    if (!this.hum) {
      const ctx = this.ctx;
      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = "sawtooth";
      b.type = "sawtooth";
      a.frequency.value = 55;
      b.frequency.value = 55.3;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 120;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      a.connect(f);
      b.connect(f);
      f.connect(g).connect(this.ch.sim);
      a.start();
      b.start();
      this.hum = { a, b, f, g };
    }
    const t = this.ctx.currentTime;
    const h = this.hum;
    h.g.gain.setTargetAtTime(u < 0.02 ? 0.0001 : 0.015 + 0.07 * u * u, t, 0.25);
    h.f.frequency.setTargetAtTime(110 + 900 * u * u, t, 0.3);
    h.b.frequency.setTargetAtTime(55 + 0.3 + 6 * u * u, t, 0.4); // beating speeds up under stress
    h.a.frequency.setTargetAtTime(55 + 8 * Math.max(0, u - 0.8), t, 0.4);
  }

  stopLoad(): void {
    if (!this.hum || !this.ctx) return;
    const h = this.hum;
    h.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
    setTimeout(() => {
      try {
        h.a.stop();
        h.b.stop();
      } catch {
        /* already stopped */
      }
    }, 800);
    this.hum = null;
  }

  // ---------------------------------------------------------------- alerts

  alarm(on: boolean): void {
    if (on && !this.alarmTimer) {
      const ring = () => {
        this.tone({ ch: "alerts", type: "triangle", hz: midiHz(76), attack: 0.01, decay: 0.3, gain: 0.07, filterHz: 1600 });
        this.tone({ ch: "alerts", type: "triangle", hz: midiHz(72), attack: 0.01, decay: 0.4, gain: 0.07, filterHz: 1600, delay: 0.22 });
      };
      ring();
      this.alarmTimer = setInterval(ring, 2200);
    } else if (!on && this.alarmTimer) {
      clearInterval(this.alarmTimer);
      this.alarmTimer = null;
    }
  }

  /** A single pager buzz. */
  pager(): void {
    for (let i = 0; i < 3; i++) {
      this.tone({ ch: "alerts", type: "triangle", hz: midiHz(84), attack: 0.005, decay: 0.1, gain: 0.06, filterHz: 2400, delay: i * 0.14 });
    }
  }

  /** Systems coming back: a rising arpeggio that resolves. */
  recovery(): void {
    const notes = [0, 7, 12, 14, 19, 24];
    notes.forEach((n, i) => this.tone({ ch: "alerts", type: "triangle", hz: midiHz(55 + n), decay: 0.9 - i * 0.08, gain: 0.09, delay: i * 0.11 }));
    this.tone({ ch: "alerts", type: "sine", hz: midiHz(43), decay: 1.8, gain: 0.12, delay: 0.55 });
  }

  /** Rank up: a bigger version of recovery with a sub drop. */
  rankUp(): void {
    this.tone({ ch: "alerts", type: "sine", hz: 90, hzEnd: 40, decay: 1.2, gain: 0.35 });
    [0, 4, 7, 11, 14, 19, 24].forEach((n, i) =>
      this.tone({ ch: "alerts", type: "triangle", hz: midiHz(60 + n), decay: 1.1, gain: 0.08, delay: 0.25 + i * 0.09 }),
    );
  }

  // ---------------------------------------------------------------- music

  startMusic(mood: Mood): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    if (this.music) {
      this.setMood(mood);
      return;
    }
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    f.connect(g).connect(this.ch.music);
    const drone = [0, 7, 12].map((iv, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = midiHz(mood.root - 24 + iv);
      o.detune.value = (i - 1) * 4;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.5 : 0.25;
      o.connect(og).connect(f);
      o.start();
      return o;
    });
    g.gain.setTargetAtTime(0.25, ctx.currentTime, 2.5);
    this.music = { drone, g, f, timer: null, mood };
    this.scheduleNote();
  }

  setMood(mood: Mood): void {
    if (!this.music || !this.ctx) return;
    this.music.mood = mood;
    const t = this.ctx.currentTime;
    this.music.f.frequency.setTargetAtTime(400 + 1600 * mood.intensity, t, 1.5);
    this.music.drone.forEach((o, i) => o.frequency.setTargetAtTime(midiHz(mood.root - 24 + [0, 7, 12][i]!), t, 1));
  }

  private scheduleNote(): void {
    if (!this.music) return;
    const { mood } = this.music;
    const scale = mood.scale === "dorian" ? DORIAN : PENTATONIC_MINOR;
    const deg = scale[Math.floor(Math.random() * scale.length)]!;
    const octave = Math.random() < 0.3 ? 12 : 0;
    const density = 0.35 + 0.6 * mood.intensity;
    if (Math.random() < density) {
      this.tone({ ch: "music", type: "triangle", hz: midiHz(mood.root + deg + octave), decay: 1.4 - 0.8 * mood.intensity, gain: 0.05 + 0.03 * mood.intensity, filterHz: 1400 + 2000 * mood.intensity });
    }
    const beat = 0.9 - 0.55 * mood.intensity;
    this.music.timer = setTimeout(() => this.scheduleNote(), (beat + Math.random() * 0.25) * 1000);
  }

  stopMusic(): void {
    if (!this.music || !this.ctx) return;
    const m = this.music;
    if (m.timer) clearTimeout(m.timer);
    m.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.8);
    setTimeout(() => m.drone.forEach((o) => o.stop()), 3000);
    this.music = null;
  }

  stopAll(): void {
    this.alarm(false);
    this.stopLoad();
    this.stopMusic();
  }
}

export const sfx = new NinesAudio();
export type { NinesAudio };
