// INSANITY worklet — the voice pool.
//
// 16 voices. Each voice: 8 oscillator slots x up to 8 unison, amp ADSR (per sample),
// filter ADSR + 16 mod ENVs (control rate), two TPT state-variable filters per
// channel (serial or parallel), glide, soft clip. All state is preallocated typed
// arrays; nothing here allocates after construction.
//
// Gain staging: each osc slot is scaled by level / sqrt(unison) / sqrt(active slots),
// each voice is soft-clipped to +-1 and the pool is summed at VOICE_MIX, so 16 voices
// of 8 slots at 8x unison peak around the same loudness as a small chord.

import { ENV_COUNT, MAX_VOICES, OSC_COUNT } from "@/lib/insanity/params";
import { P, VOICE_PARAM_END } from "./pidx.js";
import {
  MAX_UNISON, ADD_PARTIALS, RENDER, wtLevel, sinT,
  MODE_OFF, MODE_SINE, MODE_SQUARE, MODE_NOISE, MODE_WAVETABLE, MODE_FM, MODE_ADDITIVE, MODE_CHAOS,
} from "./osc.js";
import { vdpPeriodRatio, VDP_MU_MAX } from "./chaos.js";
import { rand01, S_ENV, S_VELOCITY, S_KEYTRACK, S_NOTERANDOM, S_AMPENV, S_FILTERENV } from "./modSources.js";
import { applyVoice } from "./modMatrix.js";

export const CTL = 32; // control-rate period in samples
export const VOICE_MIX = 0.32;
const DC_R = 0.9987; // ~10 Hz at 48 kHz

const IDLE = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3, RELEASE = 4;
const LN_1PCT = 4.605; // exp(-4.6) ~ 1%: segment "time" = time to get within 1%
const NU = OSC_COUNT * MAX_UNISON;

function softclip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

export function createVoice() {
  return {
    active: false,
    killed: false,
    id: -1,
    note: 60,
    vel: 1,
    velGain: 1,
    noteRand: 0,
    age: 0,
    targetLog: Math.log(261.63),
    curLog: Math.log(261.63),
    // amp env (per sample)
    aStage: IDLE, aLvl: 0, aInc: 0, aDec: 0, aSus: 1, aRel: 0,
    // filter env + mod envs (control rate)
    fStage: IDLE, fLvl: 0,
    mStage: new Uint8Array(ENV_COUNT),
    mLvl: new Float32Array(ENV_COUNT),
    // modulated per-voice params
    pv: new Float32Array(VOICE_PARAM_END),
    // oscillator setup (per tick)
    oscMode: new Int8Array(OSC_COUNT),
    oscU: new Int8Array(OSC_COUNT),
    oscShape: new Float64Array(OSC_COUNT),
    oscRatio: new Float64Array(OSC_COUNT),
    oscAux: new Float64Array(OSC_COUNT),
    oscSync: new Float64Array(OSC_COUNT), // sync speed (x the note) for sine/tri/saw/square
    oscWin: new Float64Array(OSC_COUNT), // CZ window depth / wavetable bend knee / noise band-pass mix
    oscDet: new Float64Array(OSC_COUNT),
    activeOsc: new Int8Array(OSC_COUNT),
    activeCount: 0,
    uInc: new Float64Array(NU),
    uGL: new Float32Array(NU),
    uGR: new Float32Array(NU),
    uPh: new Float64Array(NU),
    uPh2: new Float64Array(NU),
    vx: new Float64Array(NU),
    vv: new Float64Array(NU),
    chDt: new Float64Array(NU),
    chOs: new Uint8Array(NU),
    addPh: new Float64Array(NU * ADD_PARTIALS),
    addMul: new Float64Array(OSC_COUNT * ADD_PARTIALS),
    addAmp: new Float64Array(OSC_COUNT * ADD_PARTIALS),
    addCnt: new Int8Array(OSC_COUNT),
    // caches (recomputed only when their inputs change)
    cU: new Int8Array(OSC_COUNT),
    cDet: new Float32Array(OSC_COUNT).fill(NaN),
    cPan: new Float32Array(OSC_COUNT).fill(NaN),
    cAddR: new Float32Array(OSC_COUNT).fill(NaN),
    cAddS: new Float32Array(OSC_COUNT).fill(NaN),
    detRatio: new Float64Array(NU),
    panL: new Float32Array(NU),
    panR: new Float32Array(NU),
    rng: (Math.random() * 0x7fffffff) | 1,
    // filters: coef [g,k,a1,a2,a3] x 2; state [ic1,ic2] x (2 filters x 2 ch)
    fc: new Float64Array(10),
    fType: new Int8Array(2),
    fDrive: new Float64Array(2),
    fComp: new Float64Array(2),
    fs: new Float64Array(8),
    dc: new Float64Array(4), // DC blocker state [xL, yL, xR, yR]
    parallel: false,
    // scratch
    bL: new Float32Array(CTL),
    bR: new Float32Array(CTL),
  };
}

export function createVoicePool() {
  const voices = [];
  for (let i = 0; i < MAX_VOICES; i++) voices.push(createVoice());
  return { voices, ageCounter: 0, lastLog: NaN, mostRecent: null };
}

function resetVoiceState(v) {
  v.fs.fill(0);
  v.dc.fill(0);
  v.vx.fill(0.5);
  v.vv.fill(0);
  v.uPh2.fill(0);
}

/** Hard stop (panic or non-finite recovery). */
export function silenceVoice(v) {
  v.active = false;
  v.killed = false;
  v.aStage = IDLE;
  v.aLvl = 0;
  v.fStage = IDLE;
  v.fLvl = 0;
  v.mStage.fill(IDLE);
  v.mLvl.fill(0);
  resetVoiceState(v);
}

export function poolNoteOn(pool, base, id, freq, note, vel) {
  if (!(freq > 0) || !Number.isFinite(freq)) return;
  const voices = pool.voices;
  const poly = Math.max(1, Math.min(MAX_VOICES, Math.round(base[P.polyphony]) || 1));

  // 1. enforce polyphony: fast-release the quietest released voice, else the oldest
  for (;;) {
    let sounding = 0;
    for (const v of voices) if (v.active && !v.killed) sounding++;
    if (sounding < poly) break;
    let victim = null;
    for (const v of voices) {
      if (!v.active || v.killed || v.aStage !== RELEASE) continue;
      if (!victim || v.aLvl < victim.aLvl) victim = v;
    }
    if (!victim) for (const v of voices) {
      if (!v.active || v.killed) continue;
      if (!victim || v.age < victim.age) victim = v;
    }
    if (!victim) break;
    victim.killed = true;
    victim.aStage = RELEASE;
  }

  // 2. take a free slot; if none, reuse the quietest killed voice, else the oldest
  let v = null;
  for (const x of voices) if (!x.active) { v = x; break; }
  let reused = false;
  if (!v) {
    for (const x of voices) if (x.killed && (!v || x.aLvl < v.aLvl)) v = x;
    if (!v) for (const x of voices) if (!v || x.age < v.age) v = x;
    reused = true;
  }

  v.id = id;
  v.note = Number.isFinite(note) ? note : 60;
  v.vel = vel < 0 ? 0 : vel > 1 ? 1 : vel || 0;
  v.velGain = 0.25 + 0.75 * v.vel;
  v.noteRand = rand01() * 2 - 1;
  v.age = ++pool.ageCounter;
  v.targetLog = Math.log(freq);
  const glide = base[P.glide];
  v.curLog = glide > 0.0005 && Number.isFinite(pool.lastLog) ? pool.lastLog : v.targetLog;
  if (glide > 0.0005 && reused && v.active) v.curLog = pool.lastLog;
  pool.lastLog = v.targetLog;

  if (!reused || !v.active) {
    resetVoiceState(v);
    v.aLvl = 0;
    v.fLvl = 0;
    v.mLvl.fill(0);
  }
  // fresh phases: unison voices start scattered (supersaw spread), single voices at 0
  for (let k = 0; k < NU; k++) v.uPh[k] = rand01();
  for (let k = 0; k < v.addPh.length; k++) v.addPh[k] = rand01();
  for (let k = 0; k < NU; k++) { v.vx[k] = 0.5 + 0.2 * rand01(); v.vv[k] = 0; }
  v.cDet.fill(NaN); // force unison layout recompute (also resets phase-0 for U=1 below)
  v.active = true;
  v.killed = false;
  v.aStage = ATTACK;
  v.fStage = ATTACK;
  v.mStage.fill(ATTACK);
  pool.mostRecent = v;
}

export function poolNoteOff(pool, id) {
  for (const v of pool.voices) {
    if (v.active && v.id === id && v.aStage !== RELEASE) releaseVoice(v);
  }
}

export function releaseVoice(v) {
  v.aStage = RELEASE;
  v.fStage = RELEASE;
  for (let i = 0; i < ENV_COUNT; i++) if (v.mStage[i] !== IDLE) v.mStage[i] = RELEASE;
}

export function poolAllNotesOff(pool) {
  for (const v of pool.voices) if (v.active) releaseVoice(v);
}

export function poolPanic(pool) {
  for (const v of pool.voices) silenceVoice(v);
  pool.lastLog = NaN;
  pool.mostRecent = null;
}

/** Control-rate ADSR step. Returns new level; stage is in/out via the arrays. */
function envStep(stageArr, lvlArr, i, a, d, s, r, dt) {
  let lvl = lvlArr[i];
  switch (stageArr[i]) {
    case ATTACK:
      lvl += dt / Math.max(0.0005, a);
      if (lvl >= 1) { lvl = 1; stageArr[i] = DECAY; }
      break;
    case DECAY:
    case SUSTAIN:
      lvl = s + (lvl - s) * Math.exp((-LN_1PCT * dt) / Math.max(0.0005, d));
      break;
    case RELEASE:
      lvl *= Math.exp((-LN_1PCT * dt) / Math.max(0.0005, r));
      if (lvl < 1e-4) { lvl = 0; stageArr[i] = IDLE; }
      break;
    default:
      lvl = 0;
  }
  lvlArr[i] = lvl;
  return lvl;
}

const fStageArr = new Uint8Array(1);
const fLvlArr = new Float32Array(1);

/** Write this voice's per-voice source values into src. */
export function fillVoiceSources(v, src) {
  for (let i = 0; i < ENV_COUNT; i++) src[S_ENV + i] = v.mLvl[i];
  src[S_VELOCITY] = v.vel;
  let kt = (v.note - 60) / 60;
  src[S_KEYTRACK] = kt < -1 ? -1 : kt > 1 ? 1 : kt;
  src[S_NOTERANDOM] = v.noteRand;
  src[S_AMPENV] = v.aLvl;
  src[S_FILTERENV] = v.fLvl;
}

export function clearVoiceSources(src) {
  for (let i = 0; i < ENV_COUNT; i++) src[S_ENV + i] = 0;
  src[S_VELOCITY] = src[S_KEYTRACK] = src[S_NOTERANDOM] = src[S_AMPENV] = src[S_FILTERENV] = 0;
}

/**
 * Per-voice control tick: advance control-rate envelopes, modulate the per-voice params,
 * then lay out oscillators, filters and the amp envelope coefficients for the next CTL samples.
 * ctx: { sr, base, g, mm, src, bend, destroy }
 */
export function voiceControl(v, ctx) {
  const sr = ctx.sr, g = ctx.g, dt = CTL / sr;

  // mod envs (global env params, possibly modulated)
  for (let i = 0; i < ENV_COUNT; i++) {
    if (v.mStage[i] === IDLE) continue;
    const b = P.env + i * P.envStride;
    envStep(v.mStage, v.mLvl, i, g[b + P.eA], g[b + P.eD], g[b + P.eS], g[b + P.eR], dt);
  }

  fillVoiceSources(v, ctx.src);
  applyVoice(ctx.mm, ctx.base, v.pv, ctx.src);
  const pv = v.pv;

  // filter env
  fStageArr[0] = v.fStage; fLvlArr[0] = v.fLvl;
  envStep(fStageArr, fLvlArr, 0, pv[P.fenvA], pv[P.fenvD], pv[P.fenvS], pv[P.fenvR], dt);
  v.fStage = fStageArr[0]; v.fLvl = fLvlArr[0];

  // amp env coefficients
  v.aInc = 1 / Math.max(1, pv[P.ampA] * sr);
  v.aDec = Math.exp(-LN_1PCT / Math.max(1, pv[P.ampD] * sr));
  v.aSus = pv[P.ampS];
  v.aRel = v.killed ? Math.exp(-LN_1PCT / (0.006 * sr)) : Math.exp(-LN_1PCT / Math.max(1, pv[P.ampR] * sr));

  // glide (log-frequency one-pole)
  const glide = pv[P.glide];
  if (glide > 0.0005) v.curLog += (v.targetLog - v.curLog) * (1 - Math.exp((-3 * dt) / glide));
  else v.curLog = v.targetLog;
  const bendSemis = ctx.bend * ctx.base[P.bendRange];
  const freq = Math.exp(v.curLog + (bendSemis * Math.LN2) / 12);

  // oscillators
  const destroy = ctx.destroy;
  let n = 0;
  for (let o = 0; o < OSC_COUNT; o++) {
    const b = P.osc + o * P.oscStride;
    const mode = Math.round(pv[b + P.oMode]);
    const level = pv[b + P.oLevel];
    v.oscMode[o] = mode;
    if (mode === MODE_OFF || !(level > 0.0001) || mode < 0 || mode > MODE_CHAOS) continue;
    v.activeOsc[n++] = o;
  }
  v.activeCount = n;
  const oscNorm = 1 / Math.sqrt(Math.max(1, n));

  for (let a = 0; a < n; a++) {
    const o = v.activeOsc[a];
    const b = P.osc + o * P.oscStride;
    const mode = v.oscMode[o];
    const U = destroy ? MAX_UNISON : Math.max(1, Math.min(MAX_UNISON, Math.round(pv[b + P.oUnison])));
    let det = pv[b + P.oDetune];
    if (destroy && det < 0.3) det = 0.3;
    const pan = pv[b + P.oPan];

    // unison layout cache: detune ratios + equal-power pan gains
    if (v.cU[o] !== U || v.cDet[o] !== det || v.cPan[o] !== pan) {
      const newU = v.cU[o] !== U || Number.isNaN(v.cDet[o]);
      v.cU[o] = U; v.cDet[o] = det; v.cPan[o] = pan;
      const spread = U > 1 ? (destroy ? 1 : 0.8) : 0;
      for (let u = 0; u < U; u++) {
        const k = o * MAX_UNISON + u;
        const t = U === 1 ? 0 : (u / (U - 1)) * 2 - 1;
        v.detRatio[k] = Math.pow(2, (t * det * 50) / 1200);
        let pp = pan + t * spread;
        pp = pp < -1 ? -1 : pp > 1 ? 1 : pp;
        const th = (pp + 1) * 0.125; // quarter cycle
        v.panL[k] = sinT(th + 0.25); // cos
        v.panR[k] = sinT(th);
        if (newU && U === 1) v.uPh[k] = 0;
      }
    }

    const semis = pv[b + P.oCoarse] + pv[b + P.oFine] / 100;
    const inc0 = (freq * Math.pow(2, semis / 12)) / sr;
    const gain = (pv[b + P.oLevel] * oscNorm) / Math.sqrt(U);
    v.oscU[o] = U;
    v.oscShape[o] = pv[b + P.oShape];
    v.oscRatio[o] = pv[b + P.oRatio];
    v.oscDet[o] = det;
    v.oscSync[o] = 1;
    v.oscWin[o] = 0;
    for (let u = 0; u < U; u++) {
      const k = o * MAX_UNISON + u;
      let inc = inc0 * v.detRatio[k];
      if (!(inc < 0.45)) inc = 0.45;
      if (!(inc > 0)) inc = 1e-6;
      v.uInc[k] = inc;
      v.uGL[k] = gain * v.panL[k];
      v.uGR[k] = gain * v.panR[k];
    }

    // RATIO in the modes where it is not a literal frequency ratio (see the table in osc.js):
    // 2 is neutral; log2(ratio / 2) runs from -3 (ratio 0.25) to +3 (ratio 16).
    const rl = Math.log2(Math.max(0.25, Math.min(16, v.oscRatio[o])) / 2);
    if (mode >= MODE_SINE && mode <= MODE_SQUARE) {
      if (rl > 0.0007) { v.oscSync[o] = Math.pow(2, rl); v.oscWin[o] = 0; } // hard sync, 1x..8x
      else if (rl < -0.0007) { v.oscSync[o] = Math.pow(2, -rl); v.oscWin[o] = Math.min(1, -rl); } // CZ resonance
    } else if (mode === MODE_NOISE) {
      v.oscAux[o] = 0;
      if (rl < -0.0007) {
        // sample-and-hold: hold rate glides (log) from the sample rate down to 2x the note
        const a = Math.min(1, -rl / 3);
        const f = inc0 * sr;
        const rate = Math.exp(Math.log(sr) * (1 - a) + Math.log(2 * f) * a);
        v.oscAux[o] = rate / Math.max(1e-3, f);
        v.oscSync[o] = 1 / (1 + 1.4 * a); // held noise piles energy into the colour filter's band; trim it
      } else if (rl > 0.0007) v.oscWin[o] = Math.min(1, rl / 1.5); // band-pass at note x ratio/2
    }
    if (mode === MODE_WAVETABLE) {
      v.oscAux[o] = wtLevel(inc0 * v.detRatio[o * MAX_UNISON + U - 1]);
      let knee = 0.5 - 0.15 * rl; // bend
      v.oscWin[o] = knee < 0.04 ? 0.04 : knee > 0.96 ? 0.96 : knee;
    } else if (mode === MODE_FM) {
      // index 0..10, reduced so Carson bandwidth stays under ~Nyquist/2
      const ratio = v.oscRatio[o];
      let idx = v.oscShape[o] * 10;
      const lim = 0.22 / Math.max(1e-6, inc0 * ratio) - 1;
      if (idx > lim) idx = lim > 0 ? lim : 0;
      v.oscAux[o] = idx;
    } else if (mode === MODE_ADDITIVE) {
      const r = v.oscRatio[o], s = v.oscShape[o];
      if (v.cAddR[o] !== r || v.cAddS[o] !== s) {
        v.cAddR[o] = r; v.cAddS[o] = s;
        let stretch = 1 + Math.log2(r) / 8; // ratio 1 = harmonic, 16 = 1.5 (bell), 0.25 = 0.75 (squashed)
        stretch = stretch < 0.5 ? 0.5 : stretch > 1.6 ? 1.6 : stretch;
        const tilt = (1 - s) * 2.4; // shape 1 = flat (bright), 0 = steep (dark)
        let e = 0;
        for (let h = 0; h < ADD_PARTIALS; h++) {
          const hn = h + 1;
          v.addMul[o * ADD_PARTIALS + h] = Math.pow(hn, stretch);
          const amp = Math.pow(hn, -tilt);
          v.addAmp[o * ADD_PARTIALS + h] = amp;
          e += amp * amp;
        }
        const nrm = 0.8 / Math.sqrt(e);
        for (let h = 0; h < ADD_PARTIALS; h++) v.addAmp[o * ADD_PARTIALS + h] *= nrm;
      }
      const incTop = inc0 * v.detRatio[o * MAX_UNISON + U - 1];
      // CPU guard: 16 partials x 8 unison x 8 oscs x 16 voices is ~16k sines per sample, past
      // what JS can do in real time. Wide unison keeps fewer partials (the detune smear hides it).
      const cap = U >= 6 ? 5 : U >= 3 ? 9 : ADD_PARTIALS;
      let c = 0;
      while (c < cap && incTop * v.addMul[o * ADD_PARTIALS + c] < 0.46) c++;
      v.addCnt[o] = c;
    } else if (mode === MODE_CHAOS) {
      let mu = ctx.g[P.chaosMu] * v.oscShape[o] * 2;
      mu = mu < 0.02 ? 0.02 : mu > VDP_MU_MAX ? VDP_MU_MAX : mu;
      v.oscShape[o] = mu;
      v.oscAux[o] = ctx.g[P.chaosDrive] * 1.5;
      const R = vdpPeriodRatio(mu);
      for (let u = 0; u < U; u++) {
        const k = o * MAX_UNISON + u;
        const dT = 2 * Math.PI * v.uInc[k] * R;
        let os = Math.ceil(Math.max(1, dT / 0.06, (dT * mu) / 0.12));
        if (os > 8) os = 8;
        v.chOs[k] = os;
        v.chDt[k] = dT / os;
      }
    }
  }

  // voice filters
  const kt = (v.note - 60) / 12;
  for (let f = 0; f < 2; f++) {
    const b = P.vf1 + f * P.vfStride;
    let fc = pv[b + P.fCutoff] * Math.pow(2, pv[b + P.fEnvAmt] * v.fLvl * 7 + pv[b + P.fKeytrack] * kt);
    const fmax = sr * 0.45;
    fc = fc < 16 ? 16 : fc > fmax ? fmax : fc;
    if (!Number.isFinite(fc)) fc = 1000;
    const reso = pv[b + P.fReso];
    const gg = Math.tan((Math.PI * fc) / sr);
    const k = 2 - 1.92 * (reso < 0 ? 0 : reso > 1 ? 1 : reso);
    const a1 = 1 / (1 + gg * (gg + k));
    const c = f * 5;
    v.fc[c] = gg; v.fc[c + 1] = k; v.fc[c + 2] = a1; v.fc[c + 3] = gg * a1; v.fc[c + 4] = gg * gg * a1;
    v.fType[f] = Math.round(pv[b + P.fType]);
    const dr = pv[b + P.fDrive];
    v.fDrive[f] = dr > 0.001 ? 1 + dr * 6 : 0;
    v.fComp[f] = (dr > 0.001 ? 1 / (1 + dr * 1.5) : 1) * (1 - 0.4 * reso);
  }
  v.parallel = Math.round(pv[P.vfRouting]) === 1;

  // denormal flush on filter memory
  const fs = v.fs;
  for (let i = 0; i < 8; i++) if (Math.abs(fs[i]) < 1e-15) fs[i] = 0;
}

function svf(fs, si, c, ci, type, x) {
  const ic1 = fs[si], ic2 = fs[si + 1];
  const v3 = x - ic2;
  const v1 = c[ci + 2] * ic1 + c[ci + 3] * v3;
  const v2 = ic2 + c[ci + 3] * ic1 + c[ci + 4] * v3;
  fs[si] = 2 * v1 - ic1;
  fs[si + 1] = 2 * v2 - ic2;
  switch (type) {
    case 1: return x - c[ci + 1] * v1 - v2;
    case 2: return c[ci + 1] * v1;
    case 3: return x - c[ci + 1] * v1;
    default: return v2;
  }
}

function filt(v, f, ch, x) {
  const dr = v.fDrive[f];
  if (dr !== 0) x = softclip(x * dr);
  return svf(v.fs, f * 4 + ch * 2, v.fc, f * 5, v.fType[f], x) * v.fComp[f];
}

/**
 * Render `len` (<= CTL) samples of this voice and add them into outL/outR at `off`.
 * Returns false if the voice finished (or was reset after going non-finite).
 */
export function voiceRender(v, outL, outR, off, len) {
  const bL = v.bL, bR = v.bR;
  for (let i = 0; i < len; i++) { bL[i] = 0; bR[i] = 0; }
  for (let a = 0; a < v.activeCount; a++) {
    const o = v.activeOsc[a];
    RENDER[v.oscMode[o]](v, o, bL, bR, len);
  }

  let st = v.aStage, lvl = v.aLvl;
  const inc = v.aInc, dec = v.aDec, sus = v.aSus, rel = v.aRel, vg = v.velGain;
  const par = v.parallel;
  const dc = v.dc;
  let lastL = 0;
  for (let i = 0; i < len; i++) {
    if (st === ATTACK) {
      lvl += inc;
      if (lvl >= 1) { lvl = 1; st = DECAY; }
    } else if (st === DECAY || st === SUSTAIN) {
      lvl = sus + (lvl - sus) * dec;
    } else if (st === RELEASE) {
      lvl *= rel;
      if (lvl < 1e-5) { lvl = 0; st = IDLE; }
    } else {
      lvl = 0;
    }
    // DC blocker (~10 Hz): sync windows, held noise and chaos can carry an offset
    const il = bL[i], ir = bR[i];
    const dl = il - dc[0] + DC_R * dc[1];
    const dr = ir - dc[2] + DC_R * dc[3];
    dc[0] = il; dc[1] = dl; dc[2] = ir; dc[3] = dr;
    const xl = dl + 1e-20, xr = dr + 1e-20;
    let yl, yr;
    if (par) {
      yl = 0.5 * (filt(v, 0, 0, xl) + filt(v, 1, 0, xl));
      yr = 0.5 * (filt(v, 0, 1, xr) + filt(v, 1, 1, xr));
    } else {
      yl = filt(v, 1, 0, filt(v, 0, 0, xl));
      yr = filt(v, 1, 1, filt(v, 0, 1, xr));
    }
    const g = lvl * vg;
    lastL = softclip(yl * g);
    outL[off + i] += lastL * VOICE_MIX;
    outR[off + i] += softclip(yr * g) * VOICE_MIX;
  }
  v.aStage = st;
  v.aLvl = lvl;

  if (Math.abs(dc[1]) < 1e-15) dc[1] = 0;
  if (Math.abs(dc[3]) < 1e-15) dc[3] = 0;
  if (!Number.isFinite(lastL) || !Number.isFinite(dc[1]) || !Number.isFinite(v.fs[0]) || !Number.isFinite(v.fs[3]) || !Number.isFinite(v.fs[5])
    || !Number.isFinite(v.fs[7])) {
    // undo this chunk's contribution is not possible cheaply; the caller scrubs non-finite output
    silenceVoice(v);
    return false;
  }
  if (st === IDLE) {
    v.active = false;
    v.killed = false;
    return false;
  }
  return true;
}
