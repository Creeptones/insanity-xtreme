// INSANITY — Breezaphone and Exciton layers. Both worklets are polyphonic engines
// with their own voice pools and the same message shape:
//   voiceOn {id, freq (Hz), vel 0..1, a, d, s, r (ms), …}, voiceOff {id}, panic,
//   setVoiceMode {mode: "poly"}
// so a layer is one node in poly mode plus AudioParam writes for A/B/C/D.
//
//   Breezaphone (aerophone waveguide): A excite (jet → reed → lip), B brightness,
//                                      C air (breath noise), D growl (flutter-tongue)
//   Exciton (coupled-resonator lattice): A coupling, B tonal blend (noise → saw
//                                      exciter), C spread (harmonic → modal ratios),
//                                      D decoherence (coherence 1 → 0)

import { BREEZAPHONE_PROCESSOR_NAME, ensureBreezaphoneWorklet } from "@/lib/breezaphone/ensureBreezaphoneWorklet";
import { EXCITON_PROCESSOR_NAME, ensureExcitonWorklet } from "@/lib/exciton/ensureExcitonWorklet";
import { lerp, levelToGain, smoothSet, type LayerControls, type LayerEngine } from "./types";

abstract class MessageLayer implements LayerEngine {
  readonly output: GainNode;
  protected node: AudioWorkletNode;

  protected constructor(protected ctx: AudioContext, processor: string) {
    this.node = new AudioWorkletNode(ctx, processor, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.port.onmessage = null; // meters/scope from the engine are not used here
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.node.connect(this.output);
    this.node.port.postMessage({ type: "setVoiceMode", mode: "poly" });
  }

  protected abstract envelope(): { a: number; d: number; s: number; r: number };
  protected abstract extra(): Record<string, unknown>;
  abstract setControls(c: LayerControls): void;

  noteOn(id: number, freq: number, _note: number, vel: number): void {
    this.node.port.postMessage({ type: "voiceOn", id, freq, vel, ...this.envelope(), ...this.extra() });
  }
  noteOff(id: number): void {
    this.node.port.postMessage({ type: "voiceOff", id });
  }
  allNotesOff(): void {
    // Neither engine has a soft all-off; panic is the closest and is click-safe enough.
    this.node.port.postMessage({ type: "panic" });
  }
  panic(): void {
    this.node.port.postMessage({ type: "panic" });
  }
  protected param(name: string): AudioParam | undefined {
    return this.node.parameters.get(name);
  }
}

export class BreezaphoneLayer extends MessageLayer {
  static async create(ctx: AudioContext): Promise<BreezaphoneLayer> {
    await ensureBreezaphoneWorklet(ctx);
    return new BreezaphoneLayer(ctx);
  }
  private constructor(ctx: AudioContext) {
    super(ctx, BREEZAPHONE_PROCESSOR_NAME);
    const gain = this.param("gain");
    if (gain) gain.value = 0.6;
    const glide = this.param("glide");
    if (glide) glide.value = 0; // poly: no portamento between unrelated voices
  }
  protected envelope(): { a: number; d: number; s: number; r: number } {
    return { a: 25, d: 150, s: 0.85, r: 260 };
  }
  protected extra(): Record<string, unknown> {
    return {};
  }
  setControls(c: LayerControls): void {
    smoothSet(this.output.gain, levelToGain(c.level), this.ctx);
    smoothSet(this.param("excite"), c.a, this.ctx);
    smoothSet(this.param("brightness"), c.b, this.ctx);
    smoothSet(this.param("air"), c.c, this.ctx);
    smoothSet(this.param("growl"), c.d, this.ctx);
  }
}

export class ExcitonLayer extends MessageLayer {
  static async create(ctx: AudioContext): Promise<ExcitonLayer> {
    await ensureExcitonWorklet(ctx);
    return new ExcitonLayer(ctx);
  }
  private constructor(ctx: AudioContext) {
    super(ctx, EXCITON_PROCESSOR_NAME);
    this.node.port.postMessage({ type: "setExciter", source: "saw" });
    const gain = this.param("gain");
    if (gain) gain.value = 0.5;
  }
  protected envelope(): { a: number; d: number; s: number; r: number } {
    return { a: 12, d: 220, s: 0.7, r: 650 };
  }
  protected extra(): Record<string, unknown> {
    // Bowed articulation: excitation continues while the key is held.
    return { sustained: true };
  }
  setControls(c: LayerControls): void {
    smoothSet(this.output.gain, levelToGain(c.level), this.ctx);
    smoothSet(this.param("coupling"), lerp(0, 0.6, c.a), this.ctx);
    smoothSet(this.param("exciterBlend"), c.b, this.ctx);
    smoothSet(this.param("spread"), c.c, this.ctx);
    smoothSet(this.param("coherence"), 1 - c.d, this.ctx);
    smoothSet(this.param("decohereRate"), lerp(0.2, 8, c.d), this.ctx);
  }
}
