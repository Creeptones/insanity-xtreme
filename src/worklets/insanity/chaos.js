// INSANITY worklet — Van der Pol chaos (ported from public/worklets/bassic-engine.js).
//
//   x'' = mu (1 - x^2) x' - x + force
//
// Two users:
//   * the "chaos" oscillator mode (per voice, per unison, at audio rate; RK4 is
//     inlined in osc.js for speed, this file supplies the tuning table)
//   * the global "chaos" mod source (control rate, chaos.rate / mu / drive / amount)
//
// The limit-cycle period grows with mu, so pitch is corrected with a measured
// period-ratio table (same idea as bassic's measureVdpPeriodTau).

export const VDP_MU_MAX = 5.64; // bassic: the top in-tune setting
const TWO_PI = 2 * Math.PI;
const TABLE_POINTS = 33;
const MEASURE_DTAU = 0.01;

function accel(x, v, mu, f) {
  return mu * (1 - x * x) * v - x + f;
}

// Scratch for the scalar RK4 (no allocation per call).
const out2 = new Float64Array(2);

/** One RK4 step; result in out2[0] (x) and out2[1] (v). */
export function vdpRk4(x, v, mu, h, f) {
  const h2 = 0.5 * h;
  const k1x = v, k1v = accel(x, v, mu, f);
  const k2x = v + h2 * k1v, k2v = accel(x + h2 * k1x, v + h2 * k1v, mu, f);
  const k3x = v + h2 * k2v, k3v = accel(x + h2 * k2x, v + h2 * k2v, mu, f);
  const k4x = v + h * k3v, k4v = accel(x + h * k3x, v + h * k3v, mu, f);
  out2[0] = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
  out2[1] = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  return out2;
}

function measurePeriodTau(mu) {
  let x = 2, v = 0;
  const warm = Math.ceil(60 / MEASURE_DTAU);
  for (let i = 0; i < warm; i++) { const r = vdpRk4(x, v, mu, MEASURE_DTAU, 0); x = r[0]; v = r[1]; }
  let first = -1, last = -1, count = 0, tau = 0, prev = x;
  const maxSteps = Math.ceil((TWO_PI * (4 + mu) * 8) / MEASURE_DTAU);
  for (let i = 0; i < maxSteps && count < 7; i++) {
    const r = vdpRk4(x, v, mu, MEASURE_DTAU, 0); x = r[0]; v = r[1];
    tau += MEASURE_DTAU;
    if (prev < 0 && x >= 0) {
      const frac = prev !== x ? -prev / (x - prev) : 0;
      const t = tau - MEASURE_DTAU + frac * MEASURE_DTAU;
      if (first < 0) first = t;
      last = t;
      count++;
    }
    prev = x;
  }
  if (count < 2) return TWO_PI;
  return (last - first) / (count - 1);
}

/** period(mu)/2pi, sampled on [0, VDP_MU_MAX]. Built once at load (~a few ms). */
export const PERIOD_TABLE = (() => {
  const t = new Float64Array(TABLE_POINTS);
  for (let i = 0; i < TABLE_POINTS; i++) {
    const mu = (VDP_MU_MAX * i) / (TABLE_POINTS - 1);
    t[i] = measurePeriodTau(mu) / TWO_PI;
  }
  return t;
})();

/** Multiply the angular step by this to keep the oscillator at the requested pitch. */
export function vdpPeriodRatio(mu) {
  const m = mu < 0 ? 0 : mu > VDP_MU_MAX ? VDP_MU_MAX : mu;
  const pos = (m / VDP_MU_MAX) * (TABLE_POINTS - 1);
  const i = pos | 0;
  if (i >= TABLE_POINTS - 1) return PERIOD_TABLE[TABLE_POINTS - 1];
  const f = pos - i;
  return PERIOD_TABLE[i] * (1 - f) + PERIOD_TABLE[i + 1] * f;
}

// ---- global chaos mod source -------------------------------------------------
export function createChaosSource() {
  return { x: 0.5, v: 0, fphase: 0, value: 0 };
}

/**
 * Advance the global chaos source by dt seconds.
 * rate = cycles per second of the limit cycle, mu = nonlinearity, drive = strength of an
 * incommensurate (golden-ratio) forcing that pushes the cycle into chaos, amount = output scale.
 * Returns the bipolar value (-1..1) * amount.
 */
export function tickChaosSource(cs, rate, mu, drive, amount, dt) {
  const R = vdpPeriodRatio(mu);
  const deltaTau = TWO_PI * rate * R * dt;
  let os = Math.ceil(Math.max(1, deltaTau / 0.05, (deltaTau * mu) / 0.05));
  if (os > 64) os = 64;
  const h = deltaTau / os;
  cs.fphase += rate * 0.618034 * dt;
  cs.fphase -= Math.floor(cs.fphase);
  const f = drive * 2.5 * Math.sin(TWO_PI * cs.fphase);
  let x = cs.x, v = cs.v;
  for (let i = 0; i < os; i++) { const r = vdpRk4(x, v, mu, h, f); x = r[0]; v = r[1]; }
  if (!(Math.abs(x) < 6) || !(Math.abs(v) < 60)) { x = 0.5; v = 0; }
  cs.x = x;
  cs.v = v;
  let val = x * 0.5;
  val = val < -1 ? -1 : val > 1 ? 1 : val;
  cs.value = val * amount;
  return cs.value;
}
