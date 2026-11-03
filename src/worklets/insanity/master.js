// INSANITY — "MASTER SECTION": 3-band EQ -> compressor -> clipper -> output volume -> limiter.
//
//   EQ          low shelf 120 Hz, peak at master.eqMidFreq (Q 0.8), high shelf 8 kHz. A band
//               is skipped while its gain sits at 0 dB.
//   compressor  feed-forward, stereo-linked (max |L|,|R|), 6 dB soft knee, attack/release
//               smoothing of the gain reduction in dB. No auto makeup (master.volume does that).
//   clipper     soft clip toward a threshold that drops from 0 to -12 dB as master.clipper
//               goes 0 -> 1. Off at 0.
//   volume      master.volume dB, smoothed.
//   limiter     stereo-linked lookahead brickwall at master.ceiling. Required gain per sample
//               (ceiling/peak) -> min over a W-sample window -> release (80 ms) -> W-sample
//               moving average, applied to the signal delayed by W-1 samples. The averaged
//               gain can never exceed the required gain of the sample it lands on, so the
//               limiter itself keeps |out| <= ceiling. A hard clamp to +-ceiling follows
//               anyway, and any non-finite or absurd sample sets `bad` so bus.js can reset.
//               Latency: W-1 samples (W = 1.5 ms).

import { paramIndex } from "@/lib/insanity/params";
import {
  BUS_CHUNK, BQ_LOWSHELF, BQ_HIGHSHELF, BQ_PEAK,
  makeBiquad, biquadCoeffs, biquadRun, biquadReset, biquadFlush,
} from "./filterBank";

const I_LOW = paramIndex("master.eqLow");
const I_MID = paramIndex("master.eqMid");
const I_MIDF = paramIndex("master.eqMidFreq");
const I_HIGH = paramIndex("master.eqHigh");
const I_THRESH = paramIndex("master.compThresh");
const I_RATIO = paramIndex("master.compRatio");
const I_ATT = paramIndex("master.compAttack");
const I_REL = paramIndex("master.compRelease");
const I_CEIL = paramIndex("master.ceiling");
const I_CLIP = paramIndex("master.clipper");
const I_VOL = paramIndex("master.volume");

const LOW_F = 120;
const HIGH_F = 8000;
const MID_Q = 0.8;
const KNEE = 6;
const DB_PER_NEPER = 20 / Math.LN10; // 20*log10(x) = DB_PER_NEPER*ln(x)
const NEPER_PER_DB = Math.LN10 / 20;

function fin(v, d) {
  return v === v && v !== Infinity && v !== -Infinity ? v : d;
}
function clamp(v, lo, hi, d) {
  const x = fin(v, d);
  return x < lo ? lo : x > hi ? hi : x;
}
function sat(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

function makeEqBand(type, f, q) {
  const b = makeBiquad();
  return Object.assign(b, { type, f, q, tF: f, gain: 0, tGain: 0 });
}

export function createMaster(sampleRate) {
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const W = Math.max(8, Math.round(0.0015 * sr));
  const m = {
    sr,
    alpha: 1 - Math.exp(-BUS_CHUNK / (0.02 * sr)),
    low: makeEqBand(BQ_LOWSHELF, LOW_F, 0.707),
    mid: makeEqBand(BQ_PEAK, 1200, MID_Q),
    high: makeEqBand(BQ_HIGHSHELF, HIGH_F, 0.707),
    // compressor
    thresh: -12, ratioInv: 1 / 3, attMs: 10, relMs: 120, attC: 0, relC: 0, grDb: 0, grMax: 0,
    // clipper (amount smoothed)
    clipT: 0, clip: 0,
    // volume (linear, smoothed)
    volT: 0.5, vol: 0.5,
    // limiter
    ceil: Math.pow(10, -0.3 / 20),
    W,
    limRelC: 1 - Math.exp(-1 / (0.08 * sr)),
    reqBuf: new Float64Array(W), // required gain, last W samples
    avgBuf: new Float64Array(W), // released gain, last W samples (moving average)
    dlyL: new Float64Array(W), dlyR: new Float64Array(W), // W-1 sample delay (ring of W)
    pos: 0, avgSum: W, rel: 1,
    bad: false,
    primed: false,
  };
  setCompTimes(m, 10, 120);
  masterReset(m);
  return m;
}

function setCompTimes(m, attMs, relMs) {
  m.attC = 1 - Math.exp(-1 / (attMs * 0.001 * m.sr));
  m.relC = 1 - Math.exp(-1 / (relMs * 0.001 * m.sr));
}

export function masterSetValues(m, v) {
  m.low.tGain = clamp(v[I_LOW], -15, 15, 0);
  m.mid.tGain = clamp(v[I_MID], -15, 15, 0);
  m.mid.tF = clamp(v[I_MIDF], 200, 8000, 1200);
  m.high.tGain = clamp(v[I_HIGH], -15, 15, 0);
  m.thresh = clamp(v[I_THRESH], -48, 0, -12);
  m.ratioInv = 1 / clamp(v[I_RATIO], 1, 20, 3);
  const att = clamp(v[I_ATT], 0.1, 100, 10);
  const rel = clamp(v[I_REL], 10, 1000, 120);
  if (att !== m.attMs || rel !== m.relMs) { m.attMs = att; m.relMs = rel; setCompTimes(m, att, rel); }
  m.ceil = Math.pow(10, clamp(v[I_CEIL], -12, 0, -0.3) / 20);
  m.clipT = clamp(v[I_CLIP], 0, 1, 0);
  m.volT = Math.pow(10, clamp(v[I_VOL], -60, 6, -6) / 20);
  if (!m.primed) {
    // First values: jump straight there instead of gliding from the built-in defaults.
    m.primed = true;
    m.vol = m.volT; m.clip = m.clipT;
    for (const b of [m.low, m.mid, m.high]) {
      b.gain = b.tGain; b.f = b.tF;
      biquadCoeffs(b, b.type, b.f, b.q, b.gain, m.sr);
    }
  }
}

export function masterReset(m) {
  biquadReset(m.low); biquadReset(m.mid); biquadReset(m.high);
  m.grDb = 0;
  m.reqBuf.fill(1);
  m.avgBuf.fill(1);
  m.dlyL.fill(0); m.dlyR.fill(0);
  m.pos = 0; m.avgSum = m.W; m.rel = 1;
  m.bad = false;
}

/** Peak compressor gain reduction (dB, >= 0) since the last call. */
export function masterTakeGr(m) {
  const g = m.grMax;
  m.grMax = 0;
  return g;
}

function eqBand(m, b, L, R, off, len) {
  const al = m.alpha;
  if (b.gain !== b.tGain || b.f !== b.tF) {
    const dg = b.tGain - b.gain;
    b.gain = dg > -0.01 && dg < 0.01 ? b.tGain : b.gain + dg * al;
    const r = b.tF / b.f;
    b.f = r > 0.9999 && r < 1.0001 ? b.tF : b.f * Math.exp(al * Math.log(r));
    biquadCoeffs(b, b.type, b.f, b.q, b.gain, m.sr);
    if (b.gain === 0 && b.tGain === 0) { biquadReset(b); return; } // settled flat: bypass from now
  } else if (b.gain === 0) {
    return;
  }
  biquadRun(b, L, R, off, len);
  biquadFlush(b);
}

/** Process L/R[off .. off+len) in place. len <= BUS_CHUNK. */
export function masterProcess(m, L, R, off, len) {
  eqBand(m, m.low, L, R, off, len);
  eqBand(m, m.mid, L, R, off, len);
  eqBand(m, m.high, L, R, off, len);

  const al = m.alpha;
  const c0 = m.clip;
  const dcl = m.clipT - c0;
  const c1 = dcl > -1e-4 && dcl < 1e-4 ? m.clipT : c0 + dcl * al;
  m.clip = c1;
  const v0 = m.vol;
  const dv = m.volT - v0;
  const v1 = dv > -1e-6 && dv < 1e-6 ? m.volT : v0 + dv * al;
  m.vol = v1;
  const doClip = c0 > 0 || c1 > 0;
  // Clip threshold and blend, ramped across the chunk.
  const t0 = Math.exp(-c0 * 12 * NEPER_PER_DB), t1 = Math.exp(-c1 * 12 * NEPER_PER_DB);
  const k0 = Math.min(1, c0 * 4), k1 = Math.min(1, c1 * 4);
  const inv = 1 / len;

  const thresh = m.thresh, slope = m.ratioInv - 1, attC = m.attC, relC = m.relC;
  let gr = m.grDb, grMax = m.grMax;

  const W = m.W, req = m.reqBuf, avg = m.avgBuf, dl = m.dlyL, dr = m.dlyR, ceil = m.ceil, limRel = m.limRelC;
  let pos = m.pos, sum = m.avgSum, rel = m.rel, bad = false;
  const invW = 1 / W;

  for (let k = 0; k < len; k++) {
    const i = off + k, s = (k + 1) * inv;
    let l = L[i], r = R[i];

    // --- compressor (stereo-linked, soft knee) ---
    const al2 = l < 0 ? -l : l, ar = r < 0 ? -r : r;
    const pk = al2 > ar ? al2 : ar;
    let target = 0;
    if (pk > 1e-6) {
      const over = DB_PER_NEPER * Math.log(pk) - thresh;
      if (over >= KNEE * 0.5) target = -slope * over;
      else if (over > -KNEE * 0.5) { const o = over + KNEE * 0.5; target = (-slope * o * o) / (2 * KNEE); }
    }
    gr += (target - gr) * (target > gr ? attC : relC);
    if (gr > 1e-6) {
      const g = Math.exp(-gr * NEPER_PER_DB);
      l *= g; r *= g;
      if (gr > grMax) grMax = gr;
    }

    // --- clipper ---
    if (doClip) {
      const t = t0 + (t1 - t0) * s, kk = k0 + (k1 - k0) * s;
      const it = 1 / t;
      l += kk * (t * sat(l * it) - l);
      r += kk * (t * sat(r * it) - r);
    }

    // --- volume ---
    const vol = v0 + (v1 - v0) * s;
    l *= vol; r *= vol;

    // --- non-finite / runaway guard ---
    if (!(l < 1e6 && l > -1e6) || !(r < 1e6 && r > -1e6)) { bad = true; l = 0; r = 0; }

    // --- lookahead limiter ---
    const al3 = l < 0 ? -l : l, ar3 = r < 0 ? -r : r;
    const p = al3 > ar3 ? al3 : ar3;
    req[pos] = p > ceil ? ceil / p : 1;
    let h = 1;
    for (let j = 0; j < W; j++) { const q = req[j]; if (q < h) h = q; }
    rel += (1 - rel) * limRel;
    if (h < rel) rel = h;
    sum += rel - avg[pos];
    avg[pos] = rel;
    // Delayed sample: written W-1 samples ago lives at pos+1 (ring of W).
    const rp = pos + 1 === W ? 0 : pos + 1;
    const ol = dl[rp], or = dr[rp];
    dl[pos] = l; dr[pos] = r;
    const g = sum * invW;
    let yl = ol * g, yr = or * g;
    if (yl > ceil) yl = ceil; else if (yl < -ceil) yl = -ceil;
    if (yr > ceil) yr = ceil; else if (yr < -ceil) yr = -ceil;
    L[i] = yl; R[i] = yr;
    pos = rp;
    if (pos === 0) {
      // Kill floating-point drift in the running sum once per window.
      let t = 0;
      for (let j = 0; j < W; j++) t += avg[j];
      sum = t;
    }
  }
  m.grDb = gr; m.grMax = grMax;
  m.pos = pos; m.avgSum = sum; m.rel = rel;
  if (bad) m.bad = true;
}
