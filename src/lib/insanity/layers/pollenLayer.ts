// INSANITY — Pollen layer: the Pollen granular engine (public/worklets/pollen-engine.js)
// as an "atmosphere" layer.
//
// Pollen is a single-voice granulator that needs a source buffer. Its built-in
// sources are unpitched noise, so this layer synthesises its own PITCHED source: a
// 4 s evolving harmonic pad rooted at SOURCE_ROOT_HZ. Notes set the engine's pitch
// (semitones relative to that root) with last-note priority, because the engine is
// monophonic: chords play the newest note.
//
//   A grain size (5 → 200 ms)    B density (2 → 80 grains/s)
//   C spray (position scatter)   D position (where in the source the grains read)

import { expLerp, levelToGain, smoothSet, type LayerControls, type LayerEngine } from "./types";
import { workletUrl } from "@/lib/workletUrl";

const POLLEN_FILE = "pollen-engine.js";
const POLLEN_PROCESSOR = "pollen-engine";
const SOURCE_ROOT_HZ = 130.8128; // C3
const SOURCE_SECONDS = 4;

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
function ensurePollenWorklet(ctx: BaseAudioContext): Promise<void> {
  const hit = loaded.get(ctx);
  if (hit) return hit;
  const p = ctx.audioWorklet.addModule(workletUrl(POLLEN_FILE)).catch((err: unknown) => {
    loaded.delete(ctx);
    throw err;
  });
  loaded.set(ctx, p);
  return p;
}

/** A slowly morphing harmonic tone: brightness and odd/even balance drift along the
 * buffer, so the position knob actually changes the timbre. Stereo via detune. */
function makePitchedSource(sampleRate: number): { left: Float32Array; right: Float32Array } {
  const n = Math.floor(sampleRate * SOURCE_SECONDS);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const H = 14;
  const twoPi = Math.PI * 2;
  for (let h = 1; h <= H; h++) {
    const f = SOURCE_ROOT_HZ * h;
    if (f > sampleRate * 0.45) break;
    const phL = Math.random() * twoPi;
    const phR = Math.random() * twoPi;
    const wL = (twoPi * f) / sampleRate;
    const wR = (twoPi * f * 1.0015) / sampleRate;
    for (let i = 0; i < n; i++) {
      const pos = i / n;
      // Brightness rises across the buffer; even harmonics swell in the middle.
      const tilt = Math.pow(h, -(1.6 - 0.9 * pos));
      const even = h % 2 === 0 ? 0.4 + 0.6 * Math.sin(Math.PI * pos) : 1;
      const wob = 1 + 0.3 * Math.sin(twoPi * (0.5 + h * 0.13) * (i / sampleRate));
      const a = tilt * even * wob * 0.22;
      left[i] += a * Math.sin(wL * i + phL);
      right[i] += a * Math.sin(wR * i + phR);
    }
  }
  return { left, right };
}

export class PollenLayer implements LayerEngine {
  readonly output: GainNode;
  private node: AudioWorkletNode;
  /** Held notes, newest last (last-note priority). */
  private stack: { id: number; freq: number; vel: number }[] = [];

  static async create(ctx: AudioContext): Promise<PollenLayer> {
    await ensurePollenWorklet(ctx);
    return new PollenLayer(ctx);
  }

  private constructor(private ctx: AudioContext) {
    const src = makePitchedSource(ctx.sampleRate);
    this.node = new AudioWorkletNode(ctx, POLLEN_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { masterGain: 1, telemetry: false, seed: 0x1337 },
    });
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.node.connect(this.output);
    const port = this.node.port;
    port.postMessage({ type: "setSource", sourceL: src.left, sourceR: src.right }, [src.left.buffer, src.right.buffer]);
    port.postMessage({ type: "setAdsr", adsr: { attack: 0.35, decay: 0.4, sustain: 0.85, release: 1.6 } });
    port.postMessage({ type: "setParam", params: { pitchJitter: 0.01, panSpread: 0.6, window: "hann", filterCutoff: 9000 } });
    // The engine boots with its voice active; silence it until the first note.
    port.postMessage({ type: "noteOff" });
  }

  private pitchFor(freq: number): number {
    const st = 12 * Math.log2(Math.max(1, freq) / SOURCE_ROOT_HZ);
    return Math.max(-48, Math.min(48, st));
  }

  noteOn(id: number, freq: number, _note: number, vel: number): void {
    const legato = this.stack.length > 0;
    this.stack = this.stack.filter((s) => s.id !== id);
    this.stack.push({ id, freq, vel });
    this.node.port.postMessage({ type: "setParam", params: { pitch: this.pitchFor(freq) } });
    // Retrigger only from silence: a held pad just glides to the new pitch.
    if (!legato) this.node.port.postMessage({ type: "noteOn", velocity: vel });
  }

  noteOff(id: number): void {
    const wasTop = this.stack.length > 0 && this.stack[this.stack.length - 1].id === id;
    this.stack = this.stack.filter((s) => s.id !== id);
    if (this.stack.length === 0) {
      this.node.port.postMessage({ type: "noteOff" });
    } else if (wasTop) {
      const top = this.stack[this.stack.length - 1];
      this.node.port.postMessage({ type: "setParam", params: { pitch: this.pitchFor(top.freq) } });
    }
  }

  allNotesOff(): void {
    this.stack = [];
    this.node.port.postMessage({ type: "noteOff" });
  }

  panic(): void {
    this.allNotesOff();
  }

  setControls(c: LayerControls): void {
    smoothSet(this.output.gain, levelToGain(c.level), this.ctx);
    this.node.port.postMessage({
      type: "setParam",
      params: {
        grainSizeMs: expLerp(5, 200, c.a),
        grainRateHz: expLerp(2, 80, c.b),
        spray: c.c,
        position: c.d,
      },
    });
  }
}
