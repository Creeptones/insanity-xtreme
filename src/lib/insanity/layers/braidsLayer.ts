// INSANITY — Braids layer: the five Braids studio-tier physical-model worklets
// (public/worklets/braids-*.js), played polyphonically.
//
// The Braids worklets are MONOPHONIC resonators driven by AudioParams (no note
// messages), so this layer owns a small voice pool per model:
//
//   [noise ─► strike ─►] worklet.excite / bowVelocity / air
//   worklet ─► tone LP (C) ─► vca (envelope, release = D) ─► layer output
//
// The MODEL is a main-thread setting held by the layer manager (not a param), so the
// four A/B/C/D knobs stay continuous. A and B mean different things per model (see
// BRAIDS_MODELS); C is always the post tone lowpass, D always the release time.
// Pools are built lazily per model and cached, so switching models never leaks
// running processors.

import { ensureBraidsVoiceWorklets } from "@/components/braids/braidsWorkletLoader";
import { expLerp, lerp, levelToGain, smoothSet, type LayerControls, type LayerEngine } from "./types";

export const BRAIDS_MODELS = [
  { id: "pluck", label: "KS Pluck", processor: "braids-ks-pluck", a: "Damping", b: "Sustain", trim: 0.7 },
  { id: "bell", label: "Modal Bell", processor: "braids-modal", a: "Ring", b: "Strike", trim: 1.0 },
  { id: "reed", label: "FM Reed", processor: "braids-reed", a: "FM Index", b: "Feedback", trim: 0.35 },
  { id: "bowed", label: "Bowed String", processor: "braids-bowed", a: "Pressure", b: "Damping", trim: 0.6 },
  { id: "breath", label: "Breath Pad", processor: "braids-breath", a: "Wobble", b: "Air", trim: 0.8 },
] as const;
export type BraidsModelId = (typeof BRAIDS_MODELS)[number]["id"];
export const BRAIDS_C_LABEL = "Tone";
export const BRAIDS_D_LABEL = "Release";

const POOL_SIZE = 6;

interface Voice {
  node: AudioWorkletNode;
  lp: BiquadFilterNode;
  vca: GainNode;
  strike: GainNode | null;
  noteId: number;
  held: boolean;
  startedAt: number;
}

interface Pool {
  model: (typeof BRAIDS_MODELS)[number];
  voices: Voice[];
  bus: GainNode;
}

function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < len; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  return buf;
}

export class BraidsLayer implements LayerEngine {
  readonly output: GainNode;
  private pools = new Map<BraidsModelId, Pool>();
  private pool: Pool;
  private noise: AudioBuffer;
  private controls: LayerControls = { level: 0.6, a: 0.5, b: 0.5, c: 0.5, d: 0.5 };

  static async create(ctx: AudioContext, model: BraidsModelId): Promise<BraidsLayer> {
    await ensureBraidsVoiceWorklets(ctx);
    return new BraidsLayer(ctx, model);
  }

  private constructor(private ctx: AudioContext, model: BraidsModelId) {
    this.output = ctx.createGain();
    this.output.gain.value = levelToGain(this.controls.level);
    this.noise = makeNoiseBuffer(ctx);
    this.pool = this.buildPool(model);
    this.pool.bus.connect(this.output);
  }

  get model(): BraidsModelId {
    return this.pool.model.id;
  }

  setModel(model: BraidsModelId): void {
    if (model === this.pool.model.id) return;
    this.releaseAll(true);
    try { this.pool.bus.disconnect(); } catch { /* already disconnected */ }
    this.pool = this.pools.get(model) ?? this.buildPool(model);
    this.pool.bus.connect(this.output);
    this.setControls(this.controls);
  }

  private buildPool(id: BraidsModelId): Pool {
    const model = BRAIDS_MODELS.find((m) => m.id === id) ?? BRAIDS_MODELS[0];
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = model.trim;
    const voices: Voice[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const node = new AudioWorkletNode(ctx, model.processor, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.5;
      const vca = ctx.createGain();
      vca.gain.value = 0;
      node.connect(lp).connect(vca).connect(bus);
      let strike: GainNode | null = null;
      if (model.id === "pluck") {
        const excite = node.parameters.get("excite");
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        strike = ctx.createGain();
        strike.gain.value = 0;
        src.connect(strike);
        if (excite) strike.connect(excite);
        src.start();
      }
      if (model.id === "reed") {
        const r = node.parameters.get("modRatio");
        if (r) r.value = 2; // in-tune 2:1, as the Braids reed voice pins it
      }
      voices.push({ node, lp, vca, strike, noteId: -1, held: false, startedAt: 0 });
    }
    const pool: Pool = { model, voices, bus };
    this.pools.set(id, pool);
    return pool;
  }

  private alloc(id: number): Voice {
    const vs = this.pool.voices;
    const same = vs.find((v) => v.noteId === id);
    if (same) return same;
    let pick: Voice | null = null;
    for (const v of vs) if (!v.held && (!pick || v.startedAt < pick.startedAt)) pick = v;
    if (pick) return pick;
    for (const v of vs) if (!pick || v.startedAt < pick.startedAt) pick = v;
    return pick ?? vs[0];
  }

  private releaseTime(): number {
    return expLerp(0.02, 4, this.controls.d);
  }

  noteOn(id: number, freq: number, _note: number, vel: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const v = this.alloc(id);
    v.noteId = id;
    v.held = true;
    v.startedAt = t;
    const f = Math.min(8000, Math.max(20, freq));
    const freqP = v.node.parameters.get("frequency");
    if (freqP) { freqP.cancelScheduledValues(t); freqP.setValueAtTime(f, t); }
    const g = v.vca.gain;
    g.cancelScheduledValues(t);
    const vv = 0.3 + 0.7 * vel;
    const { b } = this.controls;
    switch (this.pool.model.id) {
      case "pluck": {
        v.node.port.postMessage({ type: "drainAt", times: [t] });
        g.setValueAtTime(vv, t);
        const s = v.strike?.gain;
        if (s) {
          s.cancelScheduledValues(t);
          s.setValueAtTime(0.9 * vel + 0.1, t + 0.003);
          s.setValueAtTime(0, t + 0.009);
        }
        break;
      }
      case "bell": {
        g.setValueAtTime(vv, t);
        const e = v.node.parameters.get("excite");
        if (e) {
          e.cancelScheduledValues(t);
          e.setValueAtTime(lerp(0.3, 1.6, b) * (0.4 + 0.6 * vel), t);
          e.setValueAtTime(0, t + 0.003);
        }
        break;
      }
      case "reed":
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(vv, t + 0.03);
        break;
      case "bowed": {
        g.setValueAtTime(vv, t);
        const bow = v.node.parameters.get("bowVelocity");
        if (bow) {
          bow.cancelScheduledValues(t);
          bow.setValueAtTime(0, t);
          bow.linearRampToValueAtTime(0.25 + 0.35 * vel, t + 0.08);
        }
        break;
      }
      case "breath": {
        g.setValueAtTime(vv, t);
        const air = v.node.parameters.get("air");
        if (air) {
          air.cancelScheduledValues(t);
          air.setValueAtTime(0, t);
          air.linearRampToValueAtTime(lerp(0.3, 1, b) * (0.5 + 0.5 * vel), t + 0.25);
        }
        break;
      }
    }
  }

  private release(v: Voice, hard: boolean): void {
    const t = this.ctx.currentTime;
    const tc = hard ? 0.01 : this.releaseTime() / 4;
    v.held = false;
    v.noteId = -1;
    const hold = (p: AudioParam | undefined): void => {
      if (!p) return;
      const cur = p.value;
      p.cancelScheduledValues(t);
      p.setValueAtTime(cur, t);
      p.setTargetAtTime(0, t, tc);
    };
    hold(v.vca.gain);
    if (this.pool.model.id === "bowed") hold(v.node.parameters.get("bowVelocity"));
    if (this.pool.model.id === "breath") hold(v.node.parameters.get("air"));
  }

  noteOff(id: number): void {
    for (const v of this.pool.voices) if (v.noteId === id) this.release(v, false);
  }

  private releaseAll(hard: boolean): void {
    for (const v of this.pool.voices) if (hard || v.held) this.release(v, hard);
  }

  allNotesOff(): void {
    this.releaseAll(false);
  }

  panic(): void {
    this.releaseAll(true);
  }

  setControls(c: LayerControls): void {
    this.controls = { ...c };
    const ctx = this.ctx;
    smoothSet(this.output.gain, levelToGain(c.level), ctx);
    const cutoff = expLerp(300, 16000, c.c);
    for (const v of this.pool.voices) {
      smoothSet(v.lp.frequency, cutoff, ctx);
      const p = (n: string): AudioParam | undefined => v.node.parameters.get(n);
      switch (this.pool.model.id) {
        case "pluck":
          smoothSet(p("damping"), c.a, ctx);
          smoothSet(p("sustain"), lerp(0.985, 0.9994, c.b), ctx);
          break;
        case "bell":
          // Ring: high = long ring (low damping multiplier).
          smoothSet(p("damping"), expLerp(4, 0.25, c.a), ctx);
          break;
        case "reed":
          smoothSet(p("fmIndex"), lerp(0.3, 5, c.a), ctx);
          smoothSet(p("feedback"), lerp(0, 1.2, c.b), ctx);
          break;
        case "bowed":
          smoothSet(p("bowPressure"), c.a, ctx);
          smoothSet(p("damping"), c.b, ctx);
          break;
        case "breath":
          smoothSet(p("wobble"), c.a, ctx);
          break;
      }
    }
  }
}
