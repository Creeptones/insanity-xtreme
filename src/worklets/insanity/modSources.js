// INSANITY worklet — modulation sources.
//
// Global (one instance, free-running, control rate): 16 LFOs, 16 FUNCs, the chaos
// source. Per-voice sources (16 ENVs, velocity, keytrack, noteRandom, ampEnv,
// filterEnv) live on the voice (voices.js); this file only knows their indexes.
//
// Source value ranges written into the shared `src` Float32Array:
//   bipolar -1..1 : lfo (x amount), func, chaos (x amount), keytrack, noteRandom
//   unipolar 0..1 : env, macro, xy, velocity, modwheel, aftertouch, ampEnv, filterEnv

import { MOD_SOURCES, LFO_COUNT, FUNC_COUNT, ENV_COUNT, MACRO_COUNT, XY_COUNT } from "@/lib/insanity/params";
import { P } from "./pidx.js";
import { createChaosSource, tickChaosSource } from "./chaos.js";

const at = (id) => {
  const i = MOD_SOURCES.indexOf(id);
  return i < 0 ? 0 : i;
};

export const SRC_COUNT = MOD_SOURCES.length;
export const S_LFO = at("lfo1");
export const S_ENV = at("env1");
export const S_FUNC = at("func1");
export const S_MACRO = at("macro1");
export const S_XY = at("xy1.x");
export const S_VELOCITY = at("velocity");
export const S_MODWHEEL = at("modwheel");
export const S_AFTERTOUCH = at("aftertouch");
export const S_KEYTRACK = at("keytrack");
export const S_CHAOS = at("chaos");
export const S_NOTERANDOM = at("noteRandom");
export const S_AMPENV = at("ampEnv");
export const S_FILTERENV = at("filterEnv");

/** True when the source differs per voice. */
export const VOICE_SOURCE = (() => {
  const m = new Uint8Array(SRC_COUNT);
  for (let i = 0; i < ENV_COUNT; i++) m[S_ENV + i] = 1;
  m[S_VELOCITY] = m[S_KEYTRACK] = m[S_NOTERANDOM] = m[S_AMPENV] = m[S_FILTERENV] = 1;
  m[0] = 0;
  return m;
})();

const TWO_PI = 2 * Math.PI;
const FUNC_STEPS = 8;

let seed = 0x2545f491;
/** Reseed the shared generator (each processor instance starts from its own seed). */
export function reseed(s) {
  seed = (s | 0) || 0x2545f491;
}

export function rand01() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}

export function createGlobalSources() {
  const fSeq = new Float32Array(FUNC_COUNT * FUNC_STEPS);
  for (let i = 0; i < fSeq.length; i++) fSeq[i] = rand01() * 2 - 1;
  // FUNCs start mid-flight (random start/target values, staggered phases) so every mode moves
  // from the first note instead of sitting at 0 for its first cycle.
  const fPh = new Float64Array(FUNC_COUNT), fPrev = new Float32Array(FUNC_COUNT), fTarget = new Float32Array(FUNC_COUNT);
  const fWalk = new Float32Array(FUNC_COUNT), fVal = new Float32Array(FUNC_COUNT), fStep = new Int32Array(FUNC_COUNT);
  for (let i = 0; i < FUNC_COUNT; i++) {
    fPh[i] = i / FUNC_COUNT;
    fPrev[i] = rand01() * 2 - 1;
    fTarget[i] = rand01() * 2 - 1;
    fWalk[i] = rand01() * 2 - 1;
    fVal[i] = fPrev[i];
    fStep[i] = i % FUNC_STEPS;
  }
  const lfoPh = new Float64Array(LFO_COUNT);
  for (let i = 0; i < LFO_COUNT; i++) lfoPh[i] = i / LFO_COUNT; // spread so 16 LFOs don't move in lockstep
  return {
    lfoPh,
    lfoSh: new Float32Array(LFO_COUNT),
    lfoVal: new Float32Array(LFO_COUNT),
    fPh, fPrev, fTarget, fWalk, fStep, fSeq, fVal,
    chaos: createChaosSource(),
    chaosVal: 0,
    modwheel: 0,
    aftertouch: 0,
  };
}

/**
 * Advance every global source by dt seconds using the (modulated) values `g`, and write
 * their outputs plus macros / XY / modwheel / aftertouch into `src`.
 */
export function tickGlobalSources(gs, g, src, dt) {
  // LFOs
  for (let i = 0; i < LFO_COUNT; i++) {
    const b = P.lfo + i * P.lfoStride;
    const shape = Math.round(g[b + P.lShape]);
    const rate = g[b + P.lRate];
    const amt = g[b + P.lAmount];
    let p = gs.lfoPh[i] + rate * dt;
    if (p >= 1) {
      p -= Math.floor(p);
      gs.lfoSh[i] = rand01() * 2 - 1;
    }
    gs.lfoPh[i] = p;
    let v;
    switch (shape) {
      case 1: v = p < 0.5 ? 4 * p - 1 : 3 - 4 * p; break;
      case 2: v = 2 * p - 1; break;
      case 3: v = p < 0.5 ? 1 : -1; break;
      case 4: v = gs.lfoSh[i]; break;
      default: v = Math.sin(TWO_PI * p);
    }
    v *= amt;
    gs.lfoVal[i] = v;
    src[S_LFO + i] = v;
  }

  // FUNCs
  for (let i = 0; i < FUNC_COUNT; i++) {
    const b = P.func + i * P.funcStride;
    const mode = Math.round(g[b + P.fnMode]);
    const rate = g[b + P.fnRate];
    const sm = g[b + P.fnSmooth];
    let p = gs.fPh[i] + rate * dt;
    const wrapped = p >= 1;
    if (wrapped) {
      p -= Math.floor(p);
      gs.fPrev[i] = gs.fTarget[i];
      gs.fTarget[i] = rand01() * 2 - 1;
      gs.fStep[i] = (gs.fStep[i] + 1) % FUNC_STEPS;
    }
    gs.fPh[i] = p;
    let raw;
    switch (mode) {
      case 1: raw = gs.fTarget[i]; break; // sample & hold
      case 2: { // drift: bounded random walk
        let w = gs.fWalk[i] + (rand01() * 2 - 1) * Math.sqrt(rate * dt) * 0.6 - gs.fWalk[i] * rate * dt * 0.15;
        w = w < -1 ? -1 : w > 1 ? 1 : w;
        gs.fWalk[i] = w;
        raw = w;
        break;
      }
      case 3: raw = gs.fSeq[i * FUNC_STEPS + gs.fStep[i]]; break; // 8-step random sequence
      default: raw = gs.fPrev[i] + (gs.fTarget[i] - gs.fPrev[i]) * p; // smooth random ramps
    }
    const tau = sm * sm * 1.2; // smooth 0 = raw steps, 1 = 1.2 s glide
    const a = tau > 1e-4 ? 1 - Math.exp(-dt / tau) : 1;
    let v = gs.fVal[i] + a * (raw - gs.fVal[i]);
    if (!Number.isFinite(v)) v = 0;
    gs.fVal[i] = v;
    src[S_FUNC + i] = v;
  }

  // chaos
  gs.chaosVal = tickChaosSource(gs.chaos, g[P.chaosRate], g[P.chaosMu], g[P.chaosDrive], g[P.chaosAmount], dt);
  src[S_CHAOS] = gs.chaosVal;

  // macros, XY pads, performance controllers
  for (let i = 0; i < MACRO_COUNT; i++) src[S_MACRO + i] = g[P.macro + i];
  for (let i = 0; i < XY_COUNT * 2; i++) src[S_XY + i] = g[P.xy + i];
  src[S_MODWHEEL] = gs.modwheel;
  src[S_AFTERTOUCH] = gs.aftertouch;
  src[0] = 0;
}
