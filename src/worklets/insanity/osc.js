// INSANITY worklet — oscillator tables and per-mode render loops.
//
// WHAT EACH OSCILLATOR KNOB DOES, PER MODE (the UI shows this table)
// ------------------------------------------------------------------
// Every mode: Level, Coarse (semitones), Fine (cents), Pan, Unison (1-8 stacked copies),
// Detune (spread of the unison copies, up to +-50 cents, and their stereo spread).
// RATIO = 2 (the default) is the neutral setting in every mode except FM and Additive,
// where it is the literal frequency ratio.
//
//  mode       SHAPE                                  RATIO
//  sine       phase distortion (0.5 = pure sine;     SYNC. Above 2: hard sync. The wave runs at
//             either side bends it toward a saw)       ratio/2 x the note (2.5 = 1.25x ... 16 = 8x)
//  tri        skew (0.5 = triangle, 0/1 = ramps)       and restarts every note cycle: the classic
//  saw        0.5 = saw; lower rounds it toward a      tearing sync sweep. Below 2: "resonance"
//             sine; higher adds an octave-up saw       sync. The wave runs at 2/ratio x the note
//  square     pulse width (5%-95%)                     and fades out across each cycle (Casio CZ
//                                                      style): a vocal resonant peak that climbs
//                                                      as ratio falls toward 0.25 (= 8x).
//  noise      colour (0 = dark rumble, 1 = white)    PITCH FOCUS. 2 = plain noise. Above 2: a
//                                                      resonant band-pass at note x ratio/2 fades
//                                                      in (pitched wind, whistle). Below 2:
//                                                      sample-and-hold crunch; the hold rate falls
//                                                      from the sample rate to 2x the note at 0.25.
//                                                      Detune spreads the colour and the pitch of
//                                                      the unison copies.
//  wavetable  table position: sine > tri > saw >     BEND (phase warp). 2 = straight read. Above 2
//             square > formant                         squeezes the cycle toward its start
//                                                      (brighter, nasal); below 2 toward its end
//                                                      (hollow, softer).
//  fm         FM index 0..10 (auto-limited near      modulator frequency ratio (x the note)
//             Nyquist)
//  additive   spectral tilt (0 = dark, 1 = flat)     partial stretch: 1 = harmonic, 16 = wide and
//                                                      bell-like, 0.25 = squashed and inharmonic
//  chaos      Van der Pol nonlinearity               sub-harmonic forcing at note / ratio (its
//             (mu = chaos.mu x shape x 2)              strength is chaos.drive): growl, period
//                                                      doubling
//
// Each render function adds one oscillator slot (all of its unison voices) into the
// voice's stereo scratch buffers for `len` samples. The voice (voices.js) precomputes,
// per control tick, the per-unison phase increments (vs.uInc) and stereo gains
// (vs.uGL / vs.uGR) so the loops here do no transcendental math except where the
// mode needs it.
//
// Phases are cycles in [0, 1). Increments are clamped to < 0.45 by the voice.

export const MODE_OFF = 0, MODE_SINE = 1, MODE_TRI = 2, MODE_SAW = 3, MODE_SQUARE = 4,
  MODE_NOISE = 5, MODE_WAVETABLE = 6, MODE_FM = 7, MODE_ADDITIVE = 8, MODE_CHAOS = 9;

export const MAX_UNISON = 8;
export const ADD_PARTIALS = 16;

// ---- sine table (lookup + linear interpolation) ------------------------------
const SIN_N = 4096;
const SIN = new Float32Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin((2 * Math.PI * i) / SIN_N);

/** sin(2*pi*p) for p in [0, 1). */
export function sinT(p) {
  const x = p * SIN_N;
  const i = x | 0;
  const a = SIN[i];
  return a + (SIN[i + 1] - a) * (x - i);
}

// ---- band-limited wavetables -------------------------------------------------
// 5 frames (sine, tri, saw, square, formant) x 10 mip levels. Level l holds at most
// 512 >> l harmonics; the voice picks the level whose top harmonic stays below Nyquist.
export const WT_N = 2048;
export const WT_FRAMES = 5;
export const WT_LEVELS = 10;
const WT_STRIDE = WT_N + 1;
const WT = new Float32Array(WT_FRAMES * WT_LEVELS * WT_STRIDE);

function harmonicAmp(frame, h) {
  switch (frame) {
    case 0: return h === 1 ? 1 : 0;
    case 1: return (h & 1) ? ((((h - 1) >> 1) & 1) ? -1 : 1) / (h * h) : 0;
    case 2: return 1 / h;
    case 3: return (h & 1) ? 1 / h : 0;
    default: {
      // vowel-ish: formant humps around harmonics 4, 11 and 24
      const a = Math.exp(-(((h - 4) / 1.6) ** 2)) + 0.6 * Math.exp(-(((h - 11) / 2.6) ** 2))
        + 0.35 * Math.exp(-(((h - 24) / 4) ** 2));
      return (a + 0.15 / h) / Math.pow(h, 0.3);
    }
  }
}

(() => {
  const bS = new Float32Array(WT_N);
  for (let i = 0; i < WT_N; i++) bS[i] = Math.sin((2 * Math.PI * i) / WT_N);
  const acc = new Float64Array(WT_N);
  for (let f = 0; f < WT_FRAMES; f++) {
    acc.fill(0);
    let hDone = 0;
    for (let l = WT_LEVELS - 1; l >= 0; l--) {
      const hMax = Math.max(1, 512 >> l);
      for (let h = hDone + 1; h <= hMax; h++) {
        const a = harmonicAmp(f, h);
        if (a === 0) continue;
        for (let i = 0; i < WT_N; i++) acc[i] += a * bS[(h * i) & (WT_N - 1)];
      }
      hDone = hMax;
      const base = (f * WT_LEVELS + l) * WT_STRIDE;
      for (let i = 0; i < WT_N; i++) WT[base + i] = acc[i];
      WT[base + WT_N] = acc[0];
    }
    // normalise the whole frame by its fullest level's peak (keeps loudness consistent across notes)
    let peak = 1e-9;
    const b0 = f * WT_LEVELS * WT_STRIDE;
    for (let i = 0; i < WT_N; i++) peak = Math.max(peak, Math.abs(WT[b0 + i]));
    const g = 0.95 / peak;
    for (let l = 0; l < WT_LEVELS; l++) {
      const base = (f * WT_LEVELS + l) * WT_STRIDE;
      for (let i = 0; i < WT_STRIDE; i++) WT[base + i] *= g;
    }
  }
})();

/** Mip level for a phase increment (cycles/sample). */
export function wtLevel(inc) {
  if (inc <= 0) return 0;
  let l = Math.ceil(Math.log2(1024 * inc));
  return l < 0 ? 0 : l >= WT_LEVELS ? WT_LEVELS - 1 : l;
}

// ---- PolyBLEP ---------------------------------------------------------------
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// ---- render loops ------------------------------------------------------------
// vs fields used: uPh, uPh2 (Float64Array 64), uInc (64), uGL/uGR (64), oscU (Int8Array 8),
// oscShape/oscRatio/oscAux (Float64Array 8), addPh (64*16), addMul/addAmp (8*16), addCnt,
// vx/vv (64), chDt (64), chOs (Uint8Array 64), rng.

// ---- single-sample wave evaluators (used by the synced path) --------------------
function waveSine(q, dt, sh) {
  const d = sh < 0.02 ? 0.02 : sh > 0.98 ? 0.98 : sh;
  return sinT(q < d ? (q * 0.5) / d : 0.5 + ((q - d) * 0.5) / (1 - d));
}
function waveTri(q, dt, sh) {
  const d = sh < 0.02 ? 0.02 : sh > 0.98 ? 0.98 : sh;
  return q < d ? -1 + (q * 2) / d : 1 - ((q - d) * 2) / (1 - d);
}
function waveSaw(q, dt, sh) {
  let s = 2 * q - 1 - blep(q, dt);
  if (sh > 0.5) {
    let q2 = q + 0.5;
    if (q2 >= 1) q2 -= 1;
    s = (s + (sh - 0.5) * 2 * (2 * q2 - 1 - blep(q2, dt))) / (1 + (sh - 0.5));
  } else if (sh < 0.5) s += (1 - sh * 2) * (sinT(q) - s);
  return s;
}
function waveSquare(q, dt, sh) {
  const pw = 0.05 + 0.9 * sh;
  let s = q < pw ? 1 : -1;
  s += blep(q, dt);
  let t = q - pw;
  if (t < 0) t += 1;
  return s - blep(t, dt) - (2 * pw - 1);
}
const WAVE = [null, waveSine, waveTri, waveSaw, waveSquare];

/**
 * Synced path for sine/tri/saw/square. vs.oscSync[o] = slave speed (x the note, 1..8),
 * vs.oscWin[o] = CZ-style window depth (0 = hard sync, 1 = full fade across each cycle).
 * Within a quarter octave of ratio 2 the result crossfades from the free-running wave.
 * The master phase lives in uPh, the slave phase in uPh2.
 */
function renderSynced(vs, o, L, R, len, mode) {
  const U = vs.oscU[o];
  const wave = WAVE[mode];
  const sh = vs.oscShape[o];
  const sync = vs.oscSync[o];
  const win = vs.oscWin[o];
  // window loses ~4.8 dB at full depth; compensate. Near ratio 2 the synced wave crossfades in
  // from the free-running one, so sweeping ratio through 2 is seamless.
  const norm = 1 + 0.73 * win;
  let fade = Math.abs(Math.log2(sync)) * 4;
  if (fade > 1) fade = 1;
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let p = vs.uPh[k], q = vs.uPh2[k];
    const inc = vs.uInc[k];
    let incS = inc * sync;
    if (incS > 0.45) incS = 0.45;
    const gl = vs.uGL[k] * norm, gr = vs.uGR[k] * norm;
    for (let i = 0; i < len; i++) {
      let s = wave(q, incS, sh);
      if (win > 0) s *= 1 - win * p;
      if (fade < 1) s = wave(p, inc, sh) + fade * (s - wave(p, inc, sh));
      L[i] += s * gl;
      R[i] += s * gr;
      q += incS;
      if (q >= 1) q -= Math.floor(q);
      p += inc;
      if (p >= 1) {
        p -= 1;
        q = (p / inc) * incS; // restart the slave exactly where the master wrapped
        if (q >= 1) q -= Math.floor(q);
      }
    }
    vs.uPh[k] = p;
    vs.uPh2[k] = q;
  }
}

/** True when the slot's ratio asks for sync (anything other than ~2). */
function synced(vs, o) {
  return vs.oscSync[o] > 1.0005;
}

export function renderSine(vs, o, L, R, len) {
  if (synced(vs, o)) return renderSynced(vs, o, L, R, len, 1);
  const U = vs.oscU[o];
  const d = Math.min(0.98, Math.max(0.02, vs.oscShape[o])); // phase-distortion knee (0.5 = pure)
  const pure = d > 0.495 && d < 0.505;
  const s1 = 0.5 / d, s2 = 0.5 / (1 - d);
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let p = vs.uPh[k];
    const inc = vs.uInc[k], gl = vs.uGL[k], gr = vs.uGR[k];
    for (let i = 0; i < len; i++) {
      const q = pure ? p : p < d ? p * s1 : 0.5 + (p - d) * s2;
      const s = sinT(q);
      L[i] += s * gl;
      R[i] += s * gr;
      p += inc;
      if (p >= 1) p -= 1;
    }
    vs.uPh[k] = p;
  }
}

export function renderTri(vs, o, L, R, len) {
  if (synced(vs, o)) return renderSynced(vs, o, L, R, len, 2);
  const U = vs.oscU[o];
  const d = Math.min(0.98, Math.max(0.02, vs.oscShape[o])); // skew (0.5 = symmetric)
  const s1 = 2 / d, s2 = 2 / (1 - d);
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let p = vs.uPh[k];
    const inc = vs.uInc[k], gl = vs.uGL[k], gr = vs.uGR[k];
    for (let i = 0; i < len; i++) {
      const s = p < d ? -1 + p * s1 : 1 - (p - d) * s2;
      L[i] += s * gl;
      R[i] += s * gr;
      p += inc;
      if (p >= 1) p -= 1;
    }
    vs.uPh[k] = p;
  }
}

export function renderSaw(vs, o, L, R, len) {
  if (synced(vs, o)) return renderSynced(vs, o, L, R, len, 3);
  const U = vs.oscU[o];
  const sh = vs.oscShape[o];
  // shape < 0.5: blend toward sine (rounder); > 0.5: add a half-cycle-offset saw (octave-up sheen)
  const toSine = sh < 0.5 ? 1 - sh * 2 : 0;
  const oct = sh > 0.5 ? (sh - 0.5) * 2 : 0;
  const norm = 1 / (1 + 0.5 * oct);
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let p = vs.uPh[k];
    const inc = vs.uInc[k], gl = vs.uGL[k] * norm, gr = vs.uGR[k] * norm;
    for (let i = 0; i < len; i++) {
      let s = 2 * p - 1 - blep(p, inc);
      if (oct > 0) {
        let p2 = p + 0.5;
        if (p2 >= 1) p2 -= 1;
        s += oct * (2 * p2 - 1 - blep(p2, inc));
      }
      if (toSine > 0) s += toSine * (sinT(p) - s);
      L[i] += s * gl;
      R[i] += s * gr;
      p += inc;
      if (p >= 1) p -= 1;
    }
    vs.uPh[k] = p;
  }
}

export function renderSquare(vs, o, L, R, len) {
  if (synced(vs, o)) return renderSynced(vs, o, L, R, len, 4);
  const U = vs.oscU[o];
  const pw = 0.05 + 0.9 * vs.oscShape[o];
  const dc = 2 * pw - 1;
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let p = vs.uPh[k];
    const inc = vs.uInc[k], gl = vs.uGL[k], gr = vs.uGR[k];
    for (let i = 0; i < len; i++) {
      let s = p < pw ? 1 : -1;
      s += blep(p, inc);
      let t = p - pw;
      if (t < 0) t += 1;
      s -= blep(t, inc);
      s -= dc;
      L[i] += s * gl;
      R[i] += s * gr;
      p += inc;
      if (p >= 1) p -= 1;
    }
    vs.uPh[k] = p;
  }
}

export function renderNoise(vs, o, L, R, len) {
  const U = vs.oscU[o];
  const sh = vs.oscShape[o];
  const det = vs.oscDet[o];
  const hold = vs.oscAux[o]; // > 0: sample-and-hold; hold rate = this x the unison copy's pitch
  const bpMix = vs.oscWin[o]; // > 0: resonant band-pass at note x ratio/2 fades in
  const bpRatio = vs.oscRatio[o] * 0.5;
  let r = vs.rng | 0;
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    const t = U === 1 ? 0 : (u / (U - 1)) * 2 - 1;
    // colour, spread across the unison copies by detune
    let cs = sh * Math.pow(2, t * det * 1.5);
    cs = cs > 1 ? 1 : cs;
    const c = 0.015 + 0.985 * cs * cs;
    const comp = Math.min(8, Math.sqrt((2 - c) / c)) * 0.6 * vs.oscSync[o]; // oscSync = hold-crunch level trim
    let y = vs.uPh2[k];
    let hp = vs.uPh[k], hv = vs.addPh[k * ADD_PARTIALS];
    const hInc = hold > 0 ? vs.uInc[k] * hold : 0;
    // band-pass (TPT SVF, Q ~ 9) state in vx / vv
    let ic1 = vs.vx[k], ic2 = vs.vv[k];
    const bk = 0.11;
    let ba1 = 0, ba2 = 0, ba3 = 0;
    if (bpMix > 0) {
      let fc = vs.uInc[k] * bpRatio;
      if (fc > 0.45) fc = 0.45;
      const bg = Math.tan(Math.PI * fc);
      ba1 = 1 / (1 + bg * (bg + bk));
      ba2 = bg * ba1;
      ba3 = bg * ba2;
    }
    const gl = vs.uGL[k] * comp, gr = vs.uGR[k] * comp;
    for (let i = 0; i < len; i++) {
      r ^= r << 13; r ^= r >>> 17; r ^= r << 5;
      let w = (r | 0) * 4.656612873077393e-10; // -1..1
      if (hInc > 0) {
        hp += hInc;
        if (hp >= 1) { hp -= Math.floor(hp); hv = w; }
        w = hv;
      }
      y += c * (w - y);
      let s = y;
      if (bpMix > 0) {
        const v3 = w - ic2;
        const v1 = ba1 * ic1 + ba2 * v3;
        const v2 = ic2 + ba2 * ic1 + ba3 * v3;
        ic1 = 2 * v1 - ic1;
        ic2 = 2 * v2 - ic2;
        s += bpMix * (v1 * 0.4 - s);
      }
      L[i] += s * gl;
      R[i] += s * gr;
    }
    if (!(Math.abs(ic1) < 1e6) || !(Math.abs(ic2) < 1e6)) { ic1 = 0; ic2 = 0; }
    vs.uPh2[k] = y;
    vs.uPh[k] = hp;
    vs.addPh[k * ADD_PARTIALS] = hv;
    vs.vx[k] = ic1;
    vs.vv[k] = ic2;
  }
  vs.rng = r | 0 || 0x9e3779b9;
}

export function renderWavetable(vs, o, L, R, len) {
  const U = vs.oscU[o];
  const pos = Math.min(0.9999, Math.max(0, vs.oscShape[o])) * (WT_FRAMES - 1);
  const fa = pos | 0;
  const fb = fa + 1 < WT_FRAMES ? fa + 1 : fa;
  const mix = pos - fa;
  const lvl = vs.oscAux[o] | 0;
  const ba = (fa * WT_LEVELS + lvl) * WT_STRIDE;
  const bb = (fb * WT_LEVELS + lvl) * WT_STRIDE;
  const knee = vs.oscWin[o]; // bend: where the table's midpoint lands in the cycle (0.5 = straight)
  const straight = knee > 0.499 && knee < 0.501;
  const s1 = 0.5 / knee, s2 = 0.5 / (1 - knee);
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let p = vs.uPh[k];
    const inc = vs.uInc[k], gl = vs.uGL[k], gr = vs.uGR[k];
    for (let i = 0; i < len; i++) {
      const q = straight ? p : p < knee ? p * s1 : 0.5 + (p - knee) * s2;
      const x = q * WT_N;
      const j = x | 0;
      const t = x - j;
      const a0 = WT[ba + j], a = a0 + (WT[ba + j + 1] - a0) * t;
      const b0 = WT[bb + j], b = b0 + (WT[bb + j + 1] - b0) * t;
      const s = a + (b - a) * mix;
      L[i] += s * gl;
      R[i] += s * gr;
      p += inc;
      if (p >= 1) p -= 1;
    }
    vs.uPh[k] = p;
  }
}

export function renderFm(vs, o, L, R, len) {
  const U = vs.oscU[o];
  const ratio = vs.oscRatio[o];
  const index = vs.oscAux[o]; // already Nyquist-limited by the voice
  const ix = index * 0.15915494309189535; // radians -> cycles
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let p = vs.uPh[k], pm = vs.uPh2[k];
    const inc = vs.uInc[k], incM = inc * ratio, gl = vs.uGL[k], gr = vs.uGR[k];
    for (let i = 0; i < len; i++) {
      let q = p + ix * sinT(pm);
      q -= Math.floor(q);
      const s = sinT(q);
      L[i] += s * gl;
      R[i] += s * gr;
      p += inc;
      if (p >= 1) p -= 1;
      pm += incM;
      if (pm >= 1) pm -= Math.floor(pm);
    }
    vs.uPh[k] = p;
    vs.uPh2[k] = pm;
  }
}

export function renderAdditive(vs, o, L, R, len) {
  const U = vs.oscU[o];
  const n = vs.addCnt[o];
  const mb = o * ADD_PARTIALS;
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    const pb = k * ADD_PARTIALS;
    const inc = vs.uInc[k], gl = vs.uGL[k], gr = vs.uGR[k];
    for (let h = 0; h < n; h++) {
      let p = vs.addPh[pb + h];
      const pi = inc * vs.addMul[mb + h];
      const a = vs.addAmp[mb + h];
      const al = a * gl, ar = a * gr;
      for (let i = 0; i < len; i++) {
        const x = p * SIN_N;
        const j = x | 0;
        const a0 = SIN[j];
        const s = a0 + (SIN[j + 1] - a0) * (x - j);
        L[i] += s * al;
        R[i] += s * ar;
        p += pi;
        if (p >= 1) p -= 1;
      }
      vs.addPh[pb + h] = p;
    }
  }
}

export function renderChaos(vs, o, L, R, len) {
  const U = vs.oscU[o];
  const mu = vs.oscShape[o]; // voice stores the effective mu here for chaos mode
  const fAmp = vs.oscAux[o];
  const fRatio = 1 / vs.oscRatio[o];
  for (let u = 0; u < U; u++) {
    const k = o * MAX_UNISON + u;
    let x = vs.vx[k], v = vs.vv[k], pm = vs.uPh2[k];
    const h = vs.chDt[k], os = vs.chOs[k], h2 = 0.5 * h, h6 = h / 6;
    const incF = vs.uInc[k] * fRatio, gl = vs.uGL[k] * 0.45, gr = vs.uGR[k] * 0.45;
    for (let i = 0; i < len; i++) {
      const f = fAmp !== 0 ? fAmp * sinT(pm) : 0;
      for (let j = 0; j < os; j++) {
        const k1x = v, k1v = mu * (1 - x * x) * v - x + f;
        const x2 = x + h2 * k1x, v2 = v + h2 * k1v;
        const k2v = mu * (1 - x2 * x2) * v2 - x2 + f;
        const x3 = x + h2 * v2, v3 = v + h2 * k2v;
        const k3v = mu * (1 - x3 * x3) * v3 - x3 + f;
        const x4 = x + h * v3, v4 = v + h * k3v;
        const k4v = mu * (1 - x4 * x4) * v4 - x4 + f;
        x += h6 * (k1x + 2 * v2 + 2 * v3 + v4);
        v += h6 * (k1v + 2 * k2v + 2 * k3v + k4v);
      }
      L[i] += x * gl;
      R[i] += x * gr;
      pm += incF;
      if (pm >= 1) pm -= Math.floor(pm);
    }
    if (!(Math.abs(x) < 6) || !(Math.abs(v) < 100)) { x = 0.5; v = 0; }
    vs.vx[k] = x;
    vs.vv[k] = v;
    vs.uPh2[k] = pm;
  }
}

export const RENDER = [
  null, renderSine, renderTri, renderSaw, renderSquare, renderNoise,
  renderWavetable, renderFm, renderAdditive, renderChaos,
];
