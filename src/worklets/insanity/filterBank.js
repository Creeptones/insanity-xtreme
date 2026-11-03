// INSANITY — "FILTERS (32x)" bus filter bank + the shared RBJ biquad used by master.js.
//
// Layout: 32 bands in 4 ROWS of 8 (bands 1-8, 9-16, 17-24, 25-32). Rows run in series.
//
// Routing inside one row (the row's input is X):
//   * Every band is a "lane". Bands with parallel=0 form ONE lane together: the SERIES
//     lane, which chains them in band order (X -> band a -> band b -> ...). When a row has
//     no series bands, the series lane is simply X (the dry row input).
//   * Each band with parallel=1 is its OWN lane: it filters X (not the series output).
//   * Row output = average of all lanes = (S + sum P_k) / (1 + nParallel).
//   So "parallel" means "blended alongside the row's main path", like parallel
//   compression: a lone parallel bandpass gives 50% dry + 50% bandpass; two parallel
//   bandpasses next to a series lowpass give (LP(X) + BP1(X) + BP2(X)) / 3. Averaging
//   (rather than summing) keeps the level sane however many bands are stacked.
//   A band's on/off, type and parallel flag never switch abruptly: the band fades out
//   (8 ms), swaps, and fades back in. While fading, a parallel lane's weight in the average
//   is its fade amount, so the average stays continuous.
//
// Gain: for "peak" it is the boost/cut. For lp/hp/bp/notch it is that band's output level,
// so the knob does something for every type. bank.mix is a dry/wet over the whole bank.
// Only bands that are on (or still fading out) cost CPU; with none, the bank is bypassed.
//
// Processing is chunked by the bus into BUS_CHUNK-sample pieces; parameter smoothing
// (freq/Q/gain glide, ~12 ms) runs once per chunk and coefficients are only recomputed for
// bands whose smoothed values are still moving.

import { paramIndex, BANK_BANDS } from "@/lib/insanity/params";

export const BUS_CHUNK = 32;

export const BQ_PEAK = 0;
export const BQ_LP = 1;
export const BQ_HP = 2;
export const BQ_BP = 3;
export const BQ_NOTCH = 4;
export const BQ_LOWSHELF = 5;
export const BQ_HIGHSHELF = 6;

const ROWS = 4;
const ROW_LEN = 8;
const N = BANK_BANDS; // 32
const TWO_PI = Math.PI * 2;
const DENORM = 1e-20;

// ---- param indices, cached once ----------------------------------------------------
const I_ON = new Int32Array(N);
const I_TYPE = new Int32Array(N);
const I_FREQ = new Int32Array(N);
const I_Q = new Int32Array(N);
const I_GAIN = new Int32Array(N);
const I_PAR = new Int32Array(N);
for (let i = 0; i < N; i++) {
  const p = `bank${i + 1}`;
  I_ON[i] = paramIndex(`${p}.on`);
  I_TYPE[i] = paramIndex(`${p}.type`);
  I_FREQ[i] = paramIndex(`${p}.freq`);
  I_Q[i] = paramIndex(`${p}.q`);
  I_GAIN[i] = paramIndex(`${p}.gain`);
  I_PAR[i] = paramIndex(`${p}.parallel`);
}
const I_MIX = paramIndex("bank.mix");

// ---- shared biquad ----------------------------------------------------------------
/** Fresh stereo biquad (identity). Every field is declared up front for a stable shape. */
export function makeBiquad() {
  return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1l: 0, z2l: 0, z1r: 0, z2r: 0 };
}

export function biquadReset(bq) {
  bq.z1l = 0; bq.z2l = 0; bq.z1r = 0; bq.z2r = 0;
}

/** Flush tiny state values to 0 (call once per chunk) so decaying tails never go subnormal. */
export function biquadFlush(bq) {
  if (Math.abs(bq.z1l) < DENORM) bq.z1l = 0;
  if (Math.abs(bq.z2l) < DENORM) bq.z2l = 0;
  if (Math.abs(bq.z1r) < DENORM) bq.z1r = 0;
  if (Math.abs(bq.z2r) < DENORM) bq.z2r = 0;
}

/**
 * RBJ cookbook coefficients into bq. freq is clamped below Nyquist. For lp/hp/bp/notch,
 * gainDb is an output level; for peak and the shelves it is the boost/cut.
 */
export function biquadCoeffs(bq, type, freq, q, gainDb, sr) {
  const f = freq < 10 ? 10 : freq > sr * 0.45 ? sr * 0.45 : freq;
  const qq = q < 0.05 ? 0.05 : q;
  const w0 = (TWO_PI * f) / sr;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const alpha = sw / (2 * qq);
  let b0, b1, b2, a0, a1, a2;
  if (type === BQ_PEAK) {
    const A = Math.pow(10, gainDb / 40);
    b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
  } else if (type === BQ_LOWSHELF || type === BQ_HIGHSHELF) {
    const A = Math.pow(10, gainDb / 40);
    const sa = 2 * Math.sqrt(A) * (sw / 2) * Math.SQRT2; // shelf slope S = 1
    if (type === BQ_LOWSHELF) {
      b0 = A * ((A + 1) - (A - 1) * cw + sa);
      b1 = 2 * A * ((A - 1) - (A + 1) * cw);
      b2 = A * ((A + 1) - (A - 1) * cw - sa);
      a0 = (A + 1) + (A - 1) * cw + sa;
      a1 = -2 * ((A - 1) + (A + 1) * cw);
      a2 = (A + 1) + (A - 1) * cw - sa;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cw + sa);
      b1 = -2 * A * ((A - 1) + (A + 1) * cw);
      b2 = A * ((A + 1) + (A - 1) * cw - sa);
      a0 = (A + 1) - (A - 1) * cw + sa;
      a1 = 2 * ((A - 1) - (A + 1) * cw);
      a2 = (A + 1) - (A - 1) * cw - sa;
    }
  } else {
    a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    if (type === BQ_LP) { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else if (type === BQ_HP) { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
    else if (type === BQ_BP) { b0 = alpha; b1 = 0; b2 = -alpha; }
    else { b0 = 1; b1 = -2 * cw; b2 = 1; } // notch
    const g = Math.pow(10, gainDb / 20);
    b0 *= g; b1 *= g; b2 *= g;
  }
  const inv = 1 / a0;
  bq.b0 = b0 * inv; bq.b1 = b1 * inv; bq.b2 = b2 * inv;
  bq.a1 = a1 * inv; bq.a2 = a2 * inv;
}

/** In-place stereo biquad (transposed direct form II) over L/R[off .. off+len). */
export function biquadRun(bq, L, R, off, len) {
  const b0 = bq.b0, b1 = bq.b1, b2 = bq.b2, a1 = bq.a1, a2 = bq.a2;
  let z1l = bq.z1l, z2l = bq.z2l, z1r = bq.z1r, z2r = bq.z2r;
  const end = off + len;
  for (let i = off; i < end; i++) {
    const xl = L[i];
    const yl = b0 * xl + z1l;
    z1l = b1 * xl - a1 * yl + z2l;
    z2l = b2 * xl - a2 * yl;
    L[i] = yl;
    const xr = R[i];
    const yr = b0 * xr + z1r;
    z1r = b1 * xr - a1 * yr + z2r;
    z2r = b2 * xr - a2 * yr;
    R[i] = yr;
  }
  bq.z1l = z1l; bq.z2l = z2l; bq.z1r = z1r; bq.z2r = z2r;
}

// ---- bank ---------------------------------------------------------------------------
function makeBand() {
  return {
    b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1l: 0, z2l: 0, z1r: 0, z2r: 0,
    // targets from params
    on: false, type: 0, par: false, tFreq: 1000, tQ: 1, tGain: 0,
    // what is actually running
    curType: 0, curPar: false, freq: 1000, q: 1, gain: 0,
    amt: 0, amt0: 0, live: false,
  };
}

export function createFilterBank(sampleRate) {
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const bands = [];
  for (let i = 0; i < N; i++) bands.push(makeBand());
  return {
    sr,
    bands,
    mixT: 1,
    mix: 1,
    fadeStep: BUS_CHUNK / (0.008 * sr),
    alpha: 1 - Math.exp(-BUS_CHUNK / (0.012 * sr)),
    mixAlpha: 1 - Math.exp(-BUS_CHUNK / (0.02 * sr)),
    inL: new Float32Array(BUS_CHUNK),
    inR: new Float32Array(BUS_CHUNK),
    dryL: new Float32Array(BUS_CHUNK),
    dryR: new Float32Array(BUS_CHUNK),
    wsum: new Float32Array(BUS_CHUNK),
    primed: false,
  };
}

function fin(v, dflt) {
  return v === v && v !== Infinity && v !== -Infinity ? v : dflt;
}

/** Copy targets from the full values array. Cheap: no trig here; process() recomputes only movers. */
export function bankSetValues(fb, values) {
  const nyq = fb.sr * 0.45;
  for (let i = 0; i < N; i++) {
    const b = fb.bands[i];
    b.on = values[I_ON[i]] >= 0.5;
    let t = Math.round(fin(values[I_TYPE[i]], 0));
    b.type = t < 0 ? 0 : t > 4 ? 4 : t;
    b.par = values[I_PAR[i]] >= 0.5;
    const f = fin(values[I_FREQ[i]], 1000);
    b.tFreq = f < 20 ? 20 : f > nyq ? nyq : f;
    const q = fin(values[I_Q[i]], 1);
    b.tQ = q < 0.1 ? 0.1 : q > 18 ? 18 : q;
    const g = fin(values[I_GAIN[i]], 0);
    b.tGain = g < -18 ? -18 : g > 18 ? 18 : g;
  }
  const m = fin(values[I_MIX], 1);
  fb.mixT = m < 0 ? 0 : m > 1 ? 1 : m;
  if (!fb.primed) { fb.primed = true; fb.mix = fb.mixT; }
}

export function bankReset(fb) {
  for (let i = 0; i < N; i++) {
    const b = fb.bands[i];
    biquadReset(b);
    b.amt = 0; b.amt0 = 0; b.live = false;
  }
  fb.mix = fb.mixT;
}

function updateBand(fb, b) {
  if (b.amt === 0) {
    if (!b.on) { b.live = false; return false; }
    // Starting from silence: adopt the wanted type/routing and jump straight to the targets.
    b.curType = b.type; b.curPar = b.par;
    b.freq = b.tFreq; b.q = b.tQ; b.gain = b.tGain;
    biquadCoeffs(b, b.curType, b.freq, b.q, b.gain, fb.sr);
    biquadReset(b);
  }
  b.live = true;
  const target = b.on && b.curType === b.type && b.curPar === b.par ? 1 : 0;
  b.amt0 = b.amt;
  if (target > b.amt) { const a = b.amt + fb.fadeStep; b.amt = a > 1 ? 1 : a; }
  else if (target < b.amt) { const a = b.amt - fb.fadeStep; b.amt = a < 0 ? 0 : a; }
  // Glide freq/Q (log domain) and gain toward their targets; recompute only if moving.
  if (b.freq !== b.tFreq || b.q !== b.tQ || b.gain !== b.tGain) {
    const al = fb.alpha;
    const rf = b.tFreq / b.freq;
    b.freq = rf > 0.9999 && rf < 1.0001 ? b.tFreq : b.freq * Math.exp(al * Math.log(rf));
    const rq = b.tQ / b.q;
    b.q = rq > 0.9999 && rq < 1.0001 ? b.tQ : b.q * Math.exp(al * Math.log(rq));
    const dg = b.tGain - b.gain;
    b.gain = dg > -0.005 && dg < 0.005 ? b.tGain : b.gain + dg * al;
    biquadCoeffs(b, b.curType, b.freq, b.q, b.gain, fb.sr);
  }
  return true;
}

// Series band: in place, out = x + a*(y - x) with a ramping amt0 -> amt across the chunk.
function runSeries(b, L, R, off, len) {
  const a0 = b.amt0, a1 = b.amt;
  if (a0 === 1 && a1 === 1) { biquadRun(b, L, R, off, len); return; }
  const b0 = b.b0, b1 = b.b1, b2 = b.b2, c1 = b.a1, c2 = b.a2;
  let z1l = b.z1l, z2l = b.z2l, z1r = b.z1r, z2r = b.z2r;
  const da = (a1 - a0) / len;
  for (let k = 0; k < len; k++) {
    const i = off + k;
    const a = a0 + da * (k + 1);
    const xl = L[i];
    const yl = b0 * xl + z1l;
    z1l = b1 * xl - c1 * yl + z2l;
    z2l = b2 * xl - c2 * yl;
    L[i] = xl + a * (yl - xl);
    const xr = R[i];
    const yr = b0 * xr + z1r;
    z1r = b1 * xr - c1 * yr + z2r;
    z2r = b2 * xr - c2 * yr;
    R[i] = xr + a * (yr - xr);
  }
  b.z1l = z1l; b.z2l = z2l; b.z1r = z1r; b.z2r = z2r;
}

// Parallel band: filters the row input (inL/inR, chunk-relative) and adds a*y into L/R;
// adds its weight a to wsum for the lane average.
function runParallel(b, inL, inR, L, R, off, len, wsum) {
  const a0 = b.amt0;
  const da = (b.amt - a0) / len;
  const b0 = b.b0, b1 = b.b1, b2 = b.b2, c1 = b.a1, c2 = b.a2;
  let z1l = b.z1l, z2l = b.z2l, z1r = b.z1r, z2r = b.z2r;
  for (let k = 0; k < len; k++) {
    const a = a0 + da * (k + 1);
    const xl = inL[k];
    const yl = b0 * xl + z1l;
    z1l = b1 * xl - c1 * yl + z2l;
    z2l = b2 * xl - c2 * yl;
    const xr = inR[k];
    const yr = b0 * xr + z1r;
    z1r = b1 * xr - c1 * yr + z2r;
    z2r = b2 * xr - c2 * yr;
    L[off + k] += a * yl;
    R[off + k] += a * yr;
    wsum[k] += a;
  }
  b.z1l = z1l; b.z2l = z2l; b.z1r = z1r; b.z2r = z2r;
}

/** Process L/R[off .. off+len) in place. len <= BUS_CHUNK. */
export function bankProcess(fb, L, R, off, len) {
  const bands = fb.bands;
  let anyLive = false;
  for (let i = 0; i < N; i++) if (updateBand(fb, bands[i])) anyLive = true;
  if (!anyLive) { fb.mix = fb.mixT; return; }

  const m0 = fb.mix;
  const dm = fb.mixT - m0;
  const m1 = dm > -1e-4 && dm < 1e-4 ? fb.mixT : m0 + dm * fb.mixAlpha;
  fb.mix = m1;
  const needDry = m0 < 1 || m1 < 1;
  const dryL = fb.dryL, dryR = fb.dryR;
  if (needDry) for (let k = 0; k < len; k++) { dryL[k] = L[off + k]; dryR[k] = R[off + k]; }

  const inL = fb.inL, inR = fb.inR, wsum = fb.wsum;
  for (let r = 0; r < ROWS; r++) {
    const base = r * ROW_LEN;
    let hasSeries = false, hasPar = false;
    for (let k = 0; k < ROW_LEN; k++) {
      const b = bands[base + k];
      if (!b.live) continue;
      if (b.curPar) hasPar = true; else hasSeries = true;
    }
    if (!hasSeries && !hasPar) continue;
    if (hasPar) {
      for (let k = 0; k < len; k++) { inL[k] = L[off + k]; inR[k] = R[off + k]; wsum[k] = 1; }
    }
    if (hasSeries) {
      for (let k = 0; k < ROW_LEN; k++) {
        const b = bands[base + k];
        if (b.live && !b.curPar) runSeries(b, L, R, off, len);
      }
    }
    if (hasPar) {
      for (let k = 0; k < ROW_LEN; k++) {
        const b = bands[base + k];
        if (b.live && b.curPar) runParallel(b, inL, inR, L, R, off, len, wsum);
      }
      for (let k = 0; k < len; k++) {
        const w = 1 / wsum[k];
        L[off + k] *= w;
        R[off + k] *= w;
      }
    }
  }

  if (needDry) {
    const d = (m1 - m0) / len;
    for (let k = 0; k < len; k++) {
      const m = m0 + d * (k + 1);
      L[off + k] = dryL[k] + m * (L[off + k] - dryL[k]);
      R[off + k] = dryR[k] + m * (R[off + k] - dryR[k]);
    }
  }
  for (let i = 0; i < N; i++) if (bands[i].live) biquadFlush(bands[i]);
}
