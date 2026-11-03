// INSANITY XTREME PRO MAX ULTRA DELUXE (It Actually Works Edition) — engine worklet.
//
// Bundled by scripts/build-worklet.mjs → public/worklets/insanity-engine.js.
// Message protocol: src/lib/insanity/protocol.ts. Param table: src/lib/insanity/params.ts.
//
// Per block:
//   every CTL (32) samples: global mod sources → mod matrix (global dests) → each voice's
//   control tick (its envs, per-voice mod matrix, osc/filter layout) → render the chunk
//   then: + layer input (input 0) → bus (filter bank, fx, master; bus.js) → outputs.

import { PARAMS, PARAM_COUNT, LFO_COUNT, ENV_COUNT, FUNC_COUNT, clampParam } from "@/lib/insanity/params";
import { INSANITY_PROCESSOR_NAME } from "@/lib/insanity/protocol";
import { P } from "./pidx.js";
import { createGlobalSources, tickGlobalSources, reseed, SRC_COUNT } from "./modSources.js";
import { createModMatrix, compileMatrix, applyGlobal } from "./modMatrix.js";
import {
  CTL, createVoicePool, poolNoteOn, poolNoteOff, poolAllNotesOff, poolPanic,
  voiceControl, voiceRender, fillVoiceSources, clearVoiceSources,
} from "./voices.js";
import { createBus, busSetValues, busProcess, busPanic, busMeters, busScope } from "./bus.js";

const MAX_BLOCK = 4096;

function nowMs() {
  const p = globalThis.performance;
  return p && typeof p.now === "function" ? p.now() : Date.now();
}

class InsanityProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sr = typeof sampleRate === "number" && sampleRate > 0 ? sampleRate : 48000;
    this.base = new Float32Array(PARAM_COUNT);
    for (let i = 0; i < PARAM_COUNT; i++) this.base[i] = PARAMS[i].def;
    const init = options && options.processorOptions && options.processorOptions.values;
    if (init && init.length) this.writeAll(init);
    this.g = new Float32Array(PARAM_COUNT); // base + global modulation (what the bus sees)
    this.g.set(this.base);
    this.src = new Float32Array(SRC_COUNT);
    reseed((Math.random() * 0x7fffffff) | 1);
    this.gs = createGlobalSources();
    this.mm = createModMatrix();
    this.pool = createVoicePool();
    this.bus = createBus(this.sr);
    this.dirty = true;
    this.busDirty = true;
    this.bend = 0;
    this.ctlPos = 0; // samples until the next control tick
    this.mixL = new Float32Array(MAX_BLOCK);
    this.mixR = new Float32Array(MAX_BLOCK);
    this.viewN = -1;
    this.viewL = this.mixL;
    this.viewR = this.mixR;
    this.ctx = { sr: this.sr, base: this.base, g: this.g, mm: this.mm, src: this.src, bend: 0, destroy: false };

    // meters
    this.meterEvery = Math.max(1, Math.round(this.sr / 30));
    this.meterCount = 0;
    this.cpuMs = 0;
    this.cpuSamples = 0;
    this.cpu = 0;
    this.meter = {
      type: "meters", peakL: 0, peakR: 0, rmsL: 0, rmsR: 0, voices: 0, cpu: 0, gainReductionDb: 0,
      lfo: new Float32Array(LFO_COUNT), env: new Float32Array(ENV_COUNT), func: new Float32Array(FUNC_COUNT),
      chaos: 0, scope: new Float32Array(128),
    };

    this.port.onmessage = (e) => {
      try {
        this.onMessage(e.data);
      } catch (err) {
        this.port.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
      }
    };
    this.port.postMessage({ type: "ready" });
  }

  writeAll(values) {
    const n = Math.min(values.length, PARAM_COUNT);
    for (let i = 0; i < n; i++) this.base[i] = clampParam(PARAMS[i], Number(values[i]));
  }

  onMessage(m) {
    if (!m || typeof m !== "object") return;
    switch (m.type) {
      case "setAll":
        if (m.values) this.writeAll(m.values);
        this.dirty = true;
        break;
      case "params": {
        const idx = m.idx, val = m.val;
        if (!idx || !val) break;
        const n = Math.min(idx.length, val.length);
        for (let k = 0; k < n; k++) {
          const i = idx[k];
          if (i >= 0 && i < PARAM_COUNT) this.base[i] = clampParam(PARAMS[i], val[k]);
        }
        this.dirty = true;
        break;
      }
      case "noteOn":
        poolNoteOn(this.pool, this.base, m.id, m.freq, m.note, m.vel);
        break;
      case "noteOff":
        poolNoteOff(this.pool, m.id);
        break;
      case "allNotesOff":
        poolAllNotesOff(this.pool);
        break;
      case "panic":
        poolPanic(this.pool);
        busPanic(this.bus);
        break;
      case "controller": {
        const v = Number(m.value);
        if (!Number.isFinite(v)) break;
        if (m.name === "modwheel") this.gs.modwheel = Math.min(1, Math.max(0, v));
        else if (m.name === "aftertouch") this.gs.aftertouch = Math.min(1, Math.max(0, v));
        else if (m.name === "pitchBend") this.bend = Math.min(1, Math.max(-1, v));
        break;
      }
      default:
        break;
    }
  }

  controlTick() {
    if (this.dirty) {
      this.dirty = false;
      compileMatrix(this.mm, this.base);
      this.g.set(this.base);
      this.busDirty = true;
    }
    const ctx = this.ctx;
    ctx.bend = this.bend;
    ctx.destroy = this.base[P.destroyCpu] >= 0.5;
    tickGlobalSources(this.gs, this.g, this.src, CTL / this.sr);

    // global destinations see per-voice sources from the most recent voice
    const mr = this.pool.mostRecent;
    if (mr && mr.active) fillVoiceSources(mr, this.src);
    else clearVoiceSources(this.src);
    if (this.mm.gCount > 0) {
      applyGlobal(this.mm, this.base, this.g, this.src);
      this.busDirty = true;
    }

    const voices = this.pool.voices;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      if (v.active) voiceControl(v, ctx);
    }
  }

  process(inputs, outputs) {
    const t0 = nowMs();
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const oL = out[0];
    const oR = out.length > 1 ? out[1] : null;
    const n = Math.min(oL.length, MAX_BLOCK);
    const L = this.mixL, R = this.mixR;
    for (let i = 0; i < n; i++) { L[i] = 0; R[i] = 0; }

    const voices = this.pool.voices;
    let pos = 0;
    while (pos < n) {
      if (this.ctlPos <= 0) {
        this.controlTick();
        this.ctlPos = CTL;
      }
      const len = Math.min(this.ctlPos, n - pos);
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (v.active) voiceRender(v, L, R, pos, len);
      }
      pos += len;
      this.ctlPos -= len;
    }

    // layers (input 0): stereo, mono, or absent
    const inp = inputs && inputs[0];
    if (inp && inp.length > 0) {
      const iL = inp[0];
      const iR = inp.length > 1 ? inp[1] : iL;
      const m = Math.min(n, iL.length, iR.length);
      for (let i = 0; i < m; i++) { L[i] += iL[i]; R[i] += iR[i]; }
    }

    // scrub before the bus so one bad voice can't poison fx tails
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(L[i])) L[i] = 0;
      if (!Number.isFinite(R[i])) R[i] = 0;
    }

    if (this.busDirty) {
      busSetValues(this.bus, this.g);
      this.busDirty = this.mm.gCount > 0;
    }
    // exact-length views (cached), in case the bus reads .length rather than n
    busProcess(this.bus, this.view(n, 0), this.view(n, 1), n);

    let bad = false;
    for (let i = 0; i < n; i++) {
      let l = L[i], r = R[i];
      if (!Number.isFinite(l)) { l = 0; bad = true; }
      if (!Number.isFinite(r)) { r = 0; bad = true; }
      oL[i] = l > 1 ? 1 : l < -1 ? -1 : l;
      if (oR) oR[i] = r > 1 ? 1 : r < -1 ? -1 : r;
    }
    if (bad) busPanic(this.bus);

    // meters + cpu
    this.cpuMs += nowMs() - t0;
    this.cpuSamples += n;
    this.meterCount += n;
    if (this.meterCount >= this.meterEvery) {
      this.meterCount = 0;
      this.postMeters();
    }
    return true;
  }

  /** Cached fixed-length views of the mix buffers (one allocation per distinct block size). */
  view(n, ch) {
    if (this.viewN !== n) {
      this.viewN = n;
      this.viewL = this.mixL.subarray(0, n);
      this.viewR = this.mixR.subarray(0, n);
    }
    return ch === 0 ? this.viewL : this.viewR;
  }

  postMeters() {
    const m = this.meter;
    const budgetMs = (this.cpuSamples / this.sr) * 1000;
    const inst = budgetMs > 0 ? this.cpuMs / budgetMs : 0;
    this.cpu = this.cpu * 0.7 + inst * 0.3;
    this.cpuMs = 0;
    this.cpuSamples = 0;

    const bm = busMeters(this.bus);
    m.peakL = bm ? bm.peakL : 0;
    m.peakR = bm ? bm.peakR : 0;
    m.rmsL = bm ? bm.rmsL : 0;
    m.rmsR = bm ? bm.rmsR : 0;
    m.gainReductionDb = bm ? bm.gainReductionDb : 0;
    let count = 0;
    const voices = this.pool.voices;
    for (let i = 0; i < voices.length; i++) if (voices[i].active) count++;
    m.voices = count;
    m.cpu = this.cpu;
    m.lfo.set(this.gs.lfoVal);
    m.func.set(this.gs.fVal);
    const mr = this.pool.mostRecent;
    if (mr && mr.active) m.env.set(mr.mLvl);
    else m.env.fill(0);
    m.chaos = this.gs.chaosVal;
    const sc = busScope(this.bus);
    if (sc && sc.length) m.scope.set(sc.length > 128 ? sc.subarray(0, 128) : sc);
    this.port.postMessage(m);
  }
}

registerProcessor(INSANITY_PROCESSOR_NAME, InsanityProcessor);
