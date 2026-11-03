// INSANITY — "EFFECTS GALAXY" bus effects.
//
// Order: drive -> bitcrusher -> ring mod -> phaser -> chorus -> delay -> reverb -> width.
// Every stage is skipped while its (smoothed) mix is 0. All buffers are preallocated in
// createFx; fxProcess never allocates. Gains/mixes are smoothed per BUS_CHUNK and ramped
// linearly inside the chunk, so knob moves never zipper.
//
//   drive    tanh-style soft saturation, input gain fx.drive.db, makeup 1/sqrt(gain)
//   crush    sample-and-hold downsample by fx.crush.rate (fractional) + fx.crush.bits quantise
//   ring     multiply by a sine at fx.ring.freq (out = x*(1-m) + x*sin*m)
//   phaser   6-stage first-order allpass per channel, LFO 90 deg apart L/R, light feedback;
//            wet = 0.5*(x + allpass) (the notched signal), depth = sweep width
//   chorus   2 modulated taps per channel (4 LFO phases), wet = mean of the taps
//   delay    stereo ping-pong, damped (one-pole LP) + soft-saturated feedback, time glides
//   reverb   8-line FDN (Hadamard feedback), 4 input allpass diffusers, per-line damping;
//            size = decay time (0.25 s .. 10 s), equal-power dry/wet
//   width    M/S: side * fx.width (0 = mono, 2 = extra wide)

import { paramIndex } from "@/lib/insanity/params";
import { BUS_CHUNK } from "./filterBank";

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const ANTI_DENORM = 1e-24;

const I = {
  driveDb: paramIndex("fx.drive.db"),
  driveMix: paramIndex("fx.drive.mix"),
  crushBits: paramIndex("fx.crush.bits"),
  crushRate: paramIndex("fx.crush.rate"),
  crushMix: paramIndex("fx.crush.mix"),
  chorusRate: paramIndex("fx.chorus.rate"),
  chorusDepth: paramIndex("fx.chorus.depth"),
  chorusMix: paramIndex("fx.chorus.mix"),
  phaserRate: paramIndex("fx.phaser.rate"),
  phaserDepth: paramIndex("fx.phaser.depth"),
  phaserMix: paramIndex("fx.phaser.mix"),
  delayTime: paramIndex("fx.delay.time"),
  delayFb: paramIndex("fx.delay.feedback"),
  delayDamp: paramIndex("fx.delay.damping"),
  delayMix: paramIndex("fx.delay.mix"),
  revSize: paramIndex("fx.reverb.size"),
  revDamp: paramIndex("fx.reverb.damping"),
  revMix: paramIndex("fx.reverb.mix"),
  ringFreq: paramIndex("fx.ring.freq"),
  ringMix: paramIndex("fx.ring.mix"),
  width: paramIndex("fx.width"),
};

// Smoothed slots (cur/prev/tgt arrays).
const S_DRIVE_GAIN = 0;
const S_DRIVE_MAKEUP = 1;
const S_DRIVE_MIX = 2;
const S_CRUSH_MIX = 3;
const S_RING_MIX = 4;
const S_PHASER_MIX = 5;
const S_PHASER_DEPTH = 6;
const S_CHORUS_MIX = 7;
const S_CHORUS_DEPTH = 8;
const S_DELAY_MIX = 9;
const S_DELAY_FB = 10;
const S_REV_MIX = 11;
const S_WIDTH = 12;
const S_COUNT = 13;

const REV_LINE_MS = [31.3, 37.9, 43.1, 47.9, 53.7, 59.3, 66.1, 71.9];
const REV_DIFF_MS = [4.77, 3.59, 12.73, 9.31];
const REV_DIFF_G = 0.6;
// Output tap signs give L and R decorrelated mixes of the 8 lines.
const REV_OUT_L = [1, -1, 1, -1, 1, 1, -1, -1];
const REV_OUT_R = [1, 1, -1, -1, -1, 1, 1, -1];

// Rational tanh approximation; exact +-1 beyond |x| >= 3, slope 1 at 0.
function sat(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

function pow2AtLeast(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function fin(v, d) {
  return v === v && v !== Infinity && v !== -Infinity ? v : d;
}
function clamp(v, lo, hi, d) {
  const x = fin(v, d);
  return x < lo ? lo : x > hi ? hi : x;
}

export function createFx(sampleRate) {
  const sr = sampleRate > 0 ? sampleRate : 48000;
  const delaySize = pow2AtLeast(Math.ceil(1.25 * sr) + 8);
  const chorusSize = pow2AtLeast(Math.ceil(0.05 * sr) + 8);
  const revLen = new Int32Array(8);
  const revBuf = [];
  for (let k = 0; k < 8; k++) {
    revLen[k] = Math.max(16, Math.round((REV_LINE_MS[k] * sr) / 1000));
    revBuf.push(new Float32Array(revLen[k]));
  }
  const diffLen = new Int32Array(4);
  const diffBuf = [];
  for (let k = 0; k < 4; k++) {
    diffLen[k] = Math.max(4, Math.round((REV_DIFF_MS[k] * sr) / 1000));
    diffBuf.push(new Float32Array(diffLen[k]));
  }
  const fx = {
    sr,
    alpha: 1 - Math.exp(-BUS_CHUNK / (0.02 * sr)),
    cur: new Float64Array(S_COUNT),
    prev: new Float64Array(S_COUNT),
    tgt: new Float64Array(S_COUNT),
    // crusher
    crushBits: 16, crushStep: 1 / 32768, crushRate: 1, crushPhase: 0, crushHoldL: 0, crushHoldR: 0,
    // ring
    ringFreqT: 220, ringFreq: 220, ringC: 1, ringS: 0, ringCw: 1, ringSw: 0,
    // phaser
    phRate: 0.3, phPhase: 0, phFb: 0.35,
    phZL: new Float64Array(6), phZR: new Float64Array(6), phLastL: 0, phLastR: 0,
    // chorus
    chRate: 0.4, chPhase: 0, chBufL: new Float32Array(chorusSize), chBufR: new Float32Array(chorusSize),
    chMask: chorusSize - 1, chW: 0, chActive: false,
    // delay
    dlBufL: new Float32Array(delaySize), dlBufR: new Float32Array(delaySize), dlMask: delaySize - 1, dlW: 0,
    dlTimeT: 0.375 * sr, dlTime: 0.375 * sr, dlTimeCoef: 1 - Math.exp(-1 / (0.08 * sr)), dlMaxTime: 1.2 * sr,
    dlDampC: 0.5, dlLpL: 0, dlLpR: 0, dlActive: false,
    // reverb
    revBuf, revLen, revW: new Int32Array(8), revLp: new Float64Array(8), revG: new Float64Array(8),
    revSizeT: -1, revDampT: -1, revDampC: 0.5, revTmp: new Float64Array(8), revActive: false,
    diffBuf, diffLen, diffW: new Int32Array(4),
    primed: false,
  };
  // Sensible defaults until the first busSetValues arrives.
  fx.tgt[S_DRIVE_GAIN] = 1; fx.tgt[S_DRIVE_MAKEUP] = 1; fx.tgt[S_WIDTH] = 1;
  fx.tgt[S_PHASER_DEPTH] = 0.6; fx.tgt[S_CHORUS_DEPTH] = 0.3; fx.tgt[S_DELAY_FB] = 0.35;
  for (let k = 0; k < S_COUNT; k++) { fx.cur[k] = fx.tgt[k]; fx.prev[k] = fx.tgt[k]; }
  setRevParams(fx, 0.6, 0.5);
  setRingFreq(fx, 220);
  return fx;
}

function setRevParams(fx, size, damp) {
  if (size !== fx.revSizeT) {
    fx.revSizeT = size;
    const t60 = 0.25 * Math.pow(40, size); // 0.25 s .. 10 s
    for (let k = 0; k < 8; k++) fx.revG[k] = Math.pow(10, (-3 * fx.revLen[k]) / (fx.sr * t60));
  }
  if (damp !== fx.revDampT) {
    fx.revDampT = damp;
    const fc = Math.min(fx.sr * 0.45, 18000 * Math.pow(0.04, damp)); // 18 kHz .. 720 Hz
    fx.revDampC = 1 - Math.exp((-TWO_PI * fc) / fx.sr);
  }
}

function setRingFreq(fx, f) {
  fx.ringFreq = f;
  const w = (TWO_PI * f) / fx.sr;
  fx.ringCw = Math.cos(w);
  fx.ringSw = Math.sin(w);
}

export function fxSetValues(fx, v) {
  const sr = fx.sr;
  const t = fx.tgt;
  const db = clamp(v[I.driveDb], 0, 24, 0);
  const g = Math.pow(10, db / 20);
  t[S_DRIVE_GAIN] = g;
  t[S_DRIVE_MAKEUP] = 1 / Math.sqrt(g);
  t[S_DRIVE_MIX] = clamp(v[I.driveMix], 0, 1, 0);

  const bits = Math.round(clamp(v[I.crushBits], 2, 16, 16));
  if (bits !== fx.crushBits) { fx.crushBits = bits; fx.crushStep = 1 / Math.pow(2, bits - 1); }
  fx.crushRate = clamp(v[I.crushRate], 1, 32, 1);
  t[S_CRUSH_MIX] = clamp(v[I.crushMix], 0, 1, 0);

  fx.ringFreqT = clamp(v[I.ringFreq], 1, 4000, 220);
  t[S_RING_MIX] = clamp(v[I.ringMix], 0, 1, 0);

  fx.phRate = clamp(v[I.phaserRate], 0.05, 8, 0.3);
  t[S_PHASER_DEPTH] = clamp(v[I.phaserDepth], 0, 1, 0.6);
  t[S_PHASER_MIX] = clamp(v[I.phaserMix], 0, 1, 0);

  fx.chRate = clamp(v[I.chorusRate], 0.05, 6, 0.4);
  t[S_CHORUS_DEPTH] = clamp(v[I.chorusDepth], 0, 1, 0.3);
  t[S_CHORUS_MIX] = clamp(v[I.chorusMix], 0, 1, 0);

  fx.dlTimeT = Math.min(fx.dlMaxTime, (clamp(v[I.delayTime], 15, 1200, 375) * sr) / 1000);
  t[S_DELAY_FB] = clamp(v[I.delayFb], 0, 0.95, 0.35);
  const dd = clamp(v[I.delayDamp], 0, 1, 0.4);
  const dfc = Math.min(sr * 0.45, 20000 * Math.pow(0.025, dd)); // 20 kHz .. 500 Hz
  fx.dlDampC = 1 - Math.exp((-TWO_PI * dfc) / sr);
  t[S_DELAY_MIX] = clamp(v[I.delayMix], 0, 1, 0.15);

  setRevParams(fx, clamp(v[I.revSize], 0, 1, 0.6), clamp(v[I.revDamp], 0, 1, 0.5));
  t[S_REV_MIX] = clamp(v[I.revMix], 0, 1, 0.2);

  t[S_WIDTH] = clamp(v[I.width], 0, 2, 1);
  if (!fx.primed) {
    // First values: jump straight there instead of gliding from the built-in defaults.
    fx.primed = true;
    for (let k = 0; k < S_COUNT; k++) { fx.cur[k] = t[k]; fx.prev[k] = t[k]; }
    setRingFreq(fx, fx.ringFreqT);
    fx.dlTime = fx.dlTimeT;
  }
}

export function fxReset(fx) {
  fx.crushPhase = 0; fx.crushHoldL = 0; fx.crushHoldR = 0;
  fx.ringC = 1; fx.ringS = 0;
  fx.phZL.fill(0); fx.phZR.fill(0); fx.phLastL = 0; fx.phLastR = 0;
  fx.chBufL.fill(0); fx.chBufR.fill(0); fx.chW = 0; fx.chActive = false;
  fx.dlBufL.fill(0); fx.dlBufR.fill(0); fx.dlW = 0; fx.dlLpL = 0; fx.dlLpR = 0; fx.dlActive = false;
  fx.dlTime = fx.dlTimeT;
  for (let k = 0; k < 8; k++) fx.revBuf[k].fill(0);
  fx.revW.fill(0); fx.revLp.fill(0); fx.revActive = false;
  for (let k = 0; k < 4; k++) fx.diffBuf[k].fill(0);
  fx.diffW.fill(0);
}

// ---- stages ---------------------------------------------------------------------------
function drive(fx, L, R, off, len) {
  const d = 1 / len;
  const g0 = fx.prev[S_DRIVE_GAIN], dg = (fx.cur[S_DRIVE_GAIN] - g0) * d;
  const u0 = fx.prev[S_DRIVE_MAKEUP], du = (fx.cur[S_DRIVE_MAKEUP] - u0) * d;
  const m0 = fx.prev[S_DRIVE_MIX], dm = (fx.cur[S_DRIVE_MIX] - m0) * d;
  for (let k = 0; k < len; k++) {
    const i = off + k, s = k + 1;
    const g = g0 + dg * s, u = u0 + du * s, m = m0 + dm * s;
    const xl = L[i], xr = R[i];
    L[i] = xl + m * (sat(xl * g) * u - xl);
    R[i] = xr + m * (sat(xr * g) * u - xr);
  }
}

function crush(fx, L, R, off, len) {
  const m0 = fx.prev[S_CRUSH_MIX], dm = (fx.cur[S_CRUSH_MIX] - m0) / len;
  const step = fx.crushStep, inv = 1 / step, rate = fx.crushRate;
  let ph = fx.crushPhase, hl = fx.crushHoldL, hr = fx.crushHoldR;
  for (let k = 0; k < len; k++) {
    const i = off + k;
    const xl = L[i], xr = R[i];
    ph += 1;
    if (ph >= rate) {
      ph -= rate;
      if (ph >= rate) ph = 0;
      hl = Math.round(xl * inv) * step;
      hr = Math.round(xr * inv) * step;
    }
    const m = m0 + dm * (k + 1);
    L[i] = xl + m * (hl - xl);
    R[i] = xr + m * (hr - xr);
  }
  fx.crushPhase = ph; fx.crushHoldL = hl; fx.crushHoldR = hr;
}

function ring(fx, L, R, off, len) {
  // Glide the carrier frequency (log domain) once per chunk.
  if (fx.ringFreq !== fx.ringFreqT) {
    const r = fx.ringFreqT / fx.ringFreq;
    setRingFreq(fx, r > 0.999 && r < 1.001 ? fx.ringFreqT : fx.ringFreq * Math.exp(fx.alpha * 2 * Math.log(r)));
  }
  const m0 = fx.prev[S_RING_MIX], dm = (fx.cur[S_RING_MIX] - m0) / len;
  const cw = fx.ringCw, sw = fx.ringSw;
  let c = fx.ringC, s = fx.ringS;
  for (let k = 0; k < len; k++) {
    const i = off + k;
    const m = m0 + dm * (k + 1);
    const f = 1 - m + m * s;
    L[i] *= f;
    R[i] *= f;
    const nc = c * cw - s * sw;
    s = c * sw + s * cw;
    c = nc;
  }
  // Renormalise the phasor so rounding never grows or shrinks it.
  const n = 1 / Math.sqrt(c * c + s * s);
  fx.ringC = c * n; fx.ringS = s * n;
}

const PH_SUB = 8;
function phaser(fx, L, R, off, len) {
  const sr = fx.sr;
  const m0 = fx.prev[S_PHASER_MIX], dm = (fx.cur[S_PHASER_MIX] - m0) / len;
  const depth = fx.cur[S_PHASER_DEPTH];
  const inc = fx.phRate / sr;
  const zl = fx.phZL, zr = fx.phZR, fb = fx.phFb;
  const center = Math.log(700);
  const span = depth * Math.log(40) * 0.5; // depth 1: ~110 Hz .. 4.4 kHz
  let ph = fx.phPhase, lastL = fx.phLastL, lastR = fx.phLastR;
  let aL = 0, aR = 0;
  for (let k = 0; k < len; k++) {
    if ((k & (PH_SUB - 1)) === 0) {
      const lfoL = Math.sin(TWO_PI * ph);
      const lfoR = Math.cos(TWO_PI * ph);
      const tL = Math.tan((Math.PI * Math.exp(center + span * lfoL)) / sr);
      const tR = Math.tan((Math.PI * Math.exp(center + span * lfoR)) / sr);
      aL = (tL - 1) / (tL + 1);
      aR = (tR - 1) / (tR + 1);
    }
    ph += inc;
    if (ph >= 1) ph -= 1;
    const i = off + k;
    const xl = L[i], xr = R[i];
    let yl = xl + fb * lastL;
    let yr = xr + fb * lastR;
    for (let s = 0; s < 6; s++) {
      const ol = aL * yl + zl[s];
      zl[s] = yl - aL * ol;
      yl = ol;
      const or = aR * yr + zr[s];
      zr[s] = yr - aR * or;
      yr = or;
    }
    lastL = yl; lastR = yr;
    const m = m0 + dm * (k + 1);
    L[i] = xl + m * (0.5 * (xl + yl) - xl);
    R[i] = xr + m * (0.5 * (xr + yr) - xr);
  }
  fx.phPhase = ph;
  fx.phLastL = Math.abs(lastL) < 1e-20 ? 0 : lastL;
  fx.phLastR = Math.abs(lastR) < 1e-20 ? 0 : lastR;
  for (let s = 0; s < 6; s++) {
    if (Math.abs(zl[s]) < 1e-20) zl[s] = 0;
    if (Math.abs(zr[s]) < 1e-20) zr[s] = 0;
  }
}

function chorus(fx, L, R, off, len) {
  const sr = fx.sr;
  if (!fx.chActive) { fx.chBufL.fill(0); fx.chBufR.fill(0); fx.chActive = true; }
  const m0 = fx.prev[S_CHORUS_MIX], dm = (fx.cur[S_CHORUS_MIX] - m0) / len;
  const base = 0.014 * sr;
  const dep = (0.0003 + fx.cur[S_CHORUS_DEPTH] * 0.006) * sr; // up to +-6.3 ms
  const inc = fx.chRate / sr;
  const bl = fx.chBufL, br = fx.chBufR, mask = fx.chMask;
  let w = fx.chW, ph = fx.chPhase;
  for (let k = 0; k < len; k++) {
    const i = off + k;
    const xl = L[i], xr = R[i];
    bl[w] = xl; br[w] = xr;
    const sn = Math.sin(TWO_PI * ph), cs = Math.cos(TWO_PI * ph);
    ph += inc;
    if (ph >= 1) ph -= 1;
    // 4 taps: L at phase 0 / 180 deg, R at 90 / 270 deg.
    let d = base + dep * sn, p = w - d, ip = Math.floor(p), fr = p - ip;
    let a = bl[ip & mask], b = bl[(ip + 1) & mask];
    let wl = a + fr * (b - a);
    d = base - dep * sn; p = w - d; ip = Math.floor(p); fr = p - ip;
    a = bl[ip & mask]; b = bl[(ip + 1) & mask];
    wl = 0.5 * (wl + a + fr * (b - a));
    d = base + dep * cs; p = w - d; ip = Math.floor(p); fr = p - ip;
    a = br[ip & mask]; b = br[(ip + 1) & mask];
    let wr = a + fr * (b - a);
    d = base - dep * cs; p = w - d; ip = Math.floor(p); fr = p - ip;
    a = br[ip & mask]; b = br[(ip + 1) & mask];
    wr = 0.5 * (wr + a + fr * (b - a));
    const m = m0 + dm * (k + 1);
    L[i] = xl + m * (wl - xl);
    R[i] = xr + m * (wr - xr);
    w = (w + 1) & mask;
  }
  fx.chW = w; fx.chPhase = ph;
}

function delay(fx, L, R, off, len) {
  if (!fx.dlActive) {
    // Re-entering after being idle: drop stale echoes and jump to the current time.
    fx.dlBufL.fill(0); fx.dlBufR.fill(0); fx.dlLpL = 0; fx.dlLpR = 0;
    fx.dlTime = fx.dlTimeT; fx.dlActive = true;
  }
  const m0 = fx.prev[S_DELAY_MIX], m1 = fx.cur[S_DELAY_MIX];
  const dry0 = Math.cos(m0 * HALF_PI), wet0 = Math.sin(m0 * HALF_PI);
  const dDry = (Math.cos(m1 * HALF_PI) - dry0) / len, dWet = (Math.sin(m1 * HALF_PI) - wet0) / len;
  const f0 = fx.prev[S_DELAY_FB], df = (fx.cur[S_DELAY_FB] - f0) / len;
  const bl = fx.dlBufL, br = fx.dlBufR, mask = fx.dlMask;
  const tc = fx.dlTimeCoef, tT = fx.dlTimeT, dc = fx.dlDampC;
  let w = fx.dlW, t = fx.dlTime, lpL = fx.dlLpL, lpR = fx.dlLpR;
  for (let k = 0; k < len; k++) {
    const i = off + k, s = k + 1;
    t += (tT - t) * tc;
    const p = w - t, ip = Math.floor(p), fr = p - ip;
    let a = bl[ip & mask], b = bl[(ip + 1) & mask];
    const rl = a + fr * (b - a);
    a = br[ip & mask]; b = br[(ip + 1) & mask];
    const rr = a + fr * (b - a);
    lpL += dc * (rl - lpL);
    lpR += dc * (rr - lpR);
    const fb = f0 + df * s;
    const xl = L[i], xr = R[i];
    // Ping-pong: the input enters the left line; each line feeds the other.
    bl[w] = 0.5 * (xl + xr) + sat(fb * lpR) + ANTI_DENORM;
    br[w] = sat(fb * lpL) + ANTI_DENORM;
    const dry = dry0 + dDry * s, wet = wet0 + dWet * s;
    L[i] = xl * dry + rl * wet;
    R[i] = xr * dry + rr * wet;
    w = (w + 1) & mask;
  }
  fx.dlW = w; fx.dlTime = t;
  fx.dlLpL = Math.abs(lpL) < 1e-20 ? 0 : lpL;
  fx.dlLpR = Math.abs(lpR) < 1e-20 ? 0 : lpR;
}

const REV_WET_GAIN = 0.32;
function reverb(fx, L, R, off, len) {
  if (!fx.revActive) {
    for (let k = 0; k < 8; k++) fx.revBuf[k].fill(0);
    for (let k = 0; k < 4; k++) fx.diffBuf[k].fill(0);
    fx.revLp.fill(0); fx.revActive = true;
  }
  const m0 = fx.prev[S_REV_MIX], m1 = fx.cur[S_REV_MIX];
  const dry0 = Math.cos(m0 * HALF_PI), wet0 = Math.sin(m0 * HALF_PI) * REV_WET_GAIN;
  const dDry = (Math.cos(m1 * HALF_PI) - dry0) / len;
  const dWet = (Math.sin(m1 * HALF_PI) * REV_WET_GAIN - wet0) / len;
  const buf = fx.revBuf, rlen = fx.revLen, rw = fx.revW, lp = fx.revLp, g = fx.revG, tmp = fx.revTmp;
  const dbuf = fx.diffBuf, dlen = fx.diffLen, dw = fx.diffW;
  const dc = fx.revDampC;
  const H = 1 / Math.sqrt(8);
  for (let k = 0; k < len; k++) {
    const i = off + k, s = k + 1;
    const xl = L[i], xr = R[i];
    // Input diffusion (Schroeder allpasses) on the mono sum.
    let x = 0.5 * (xl + xr);
    for (let d = 0; d < 4; d++) {
      const b = dbuf[d];
      const j = dw[d];
      const z = b[j];
      const v = x + REV_DIFF_G * z;
      b[j] = v;
      x = z - REV_DIFF_G * v;
      dw[d] = j + 1 >= dlen[d] ? 0 : j + 1;
    }
    // Read lines, damp, collect stereo output.
    let outL = 0, outR = 0;
    for (let n = 0; n < 8; n++) {
      const y = buf[n][rw[n]];
      lp[n] += dc * (y - lp[n]);
      tmp[n] = lp[n];
      outL += REV_OUT_L[n] * y;
      outR += REV_OUT_R[n] * y;
    }
    // 8-point Hadamard (orthonormal) feedback matrix.
    let a0 = tmp[0] + tmp[1], a1 = tmp[0] - tmp[1], a2 = tmp[2] + tmp[3], a3 = tmp[2] - tmp[3];
    let a4 = tmp[4] + tmp[5], a5 = tmp[4] - tmp[5], a6 = tmp[6] + tmp[7], a7 = tmp[6] - tmp[7];
    let b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3;
    let b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
    tmp[0] = (b0 + b4) * H; tmp[1] = (b1 + b5) * H; tmp[2] = (b2 + b6) * H; tmp[3] = (b3 + b7) * H;
    tmp[4] = (b0 - b4) * H; tmp[5] = (b1 - b5) * H; tmp[6] = (b2 - b6) * H; tmp[7] = (b3 - b7) * H;
    for (let n = 0; n < 8; n++) {
      const j = rw[n];
      // Alternate input polarity across lines so the mono input excites every mode.
      buf[n][j] = tmp[n] * g[n] + ((n & 1) ? -x : x) + ANTI_DENORM;
      rw[n] = j + 1 >= rlen[n] ? 0 : j + 1;
    }
    const dry = dry0 + dDry * s, wet = wet0 + dWet * s;
    L[i] = xl * dry + outL * wet;
    R[i] = xr * dry + outR * wet;
  }
  for (let n = 0; n < 8; n++) if (Math.abs(lp[n]) < 1e-20) lp[n] = 0;
}

function width(fx, L, R, off, len) {
  const w0 = fx.prev[S_WIDTH], dw = (fx.cur[S_WIDTH] - w0) / len;
  for (let k = 0; k < len; k++) {
    const i = off + k;
    const w = w0 + dw * (k + 1);
    const m = 0.5 * (L[i] + R[i]);
    const s = 0.5 * (L[i] - R[i]) * w;
    L[i] = m + s;
    R[i] = m - s;
  }
}

/** Process L/R[off .. off+len) in place. len <= BUS_CHUNK. */
export function fxProcess(fx, L, R, off, len) {
  const cur = fx.cur, prev = fx.prev, tgt = fx.tgt, al = fx.alpha;
  for (let k = 0; k < S_COUNT; k++) {
    const c = cur[k];
    prev[k] = c;
    const d = tgt[k] - c;
    cur[k] = d > -1e-5 && d < 1e-5 ? tgt[k] : c + d * al;
  }
  if (prev[S_DRIVE_MIX] > 0 || cur[S_DRIVE_MIX] > 0) drive(fx, L, R, off, len);
  if (prev[S_CRUSH_MIX] > 0 || cur[S_CRUSH_MIX] > 0) crush(fx, L, R, off, len);
  if (prev[S_RING_MIX] > 0 || cur[S_RING_MIX] > 0) ring(fx, L, R, off, len);
  if (prev[S_PHASER_MIX] > 0 || cur[S_PHASER_MIX] > 0) phaser(fx, L, R, off, len);
  if (prev[S_CHORUS_MIX] > 0 || cur[S_CHORUS_MIX] > 0) chorus(fx, L, R, off, len);
  else fx.chActive = false;
  if (prev[S_DELAY_MIX] > 0 || cur[S_DELAY_MIX] > 0) delay(fx, L, R, off, len);
  else fx.dlActive = false;
  if (prev[S_REV_MIX] > 0 || cur[S_REV_MIX] > 0) reverb(fx, L, R, off, len);
  else fx.revActive = false;
  if (prev[S_WIDTH] !== 1 || cur[S_WIDTH] !== 1) width(fx, L, R, off, len);
}
