// INSANITY — the stereo bus: filter bank (filterBank.js) -> effects (fxChain.js) ->
// master (master.js) -> meters + scope. index.js owns the voices and calls this API:
//
//   createBus(sampleRate)        -> busState
//   busSetValues(bus, values)    full Float32Array of PARAM_COUNT real values; cheap enough
//                                to call every control block (targets only, no trig)
//   busProcess(bus, L, R, n)     in place; never allocates
//   busPanic(bus)                clear every delay / reverb / filter state
//   busMeters(bus)               { peakL, peakR, rmsL, rmsR, gainReductionDb } since the last
//                                call (reused object), then resets the accumulators
//   busScope(bus)                Float32Array(128): last 128 output points, mono, every
//                                SCOPE_DECIM-th sample (~21 ms at 48 kHz), oldest first
//
// Safety: input samples that are not finite are zeroed before the bank. If the master sees
// a non-finite or runaway sample, the rest of the block is silenced and every state is
// cleared, so one bad value can never latch the bus into NaN. The master limiter keeps
// |out| <= master.ceiling. The limiter adds 1.5 ms latency.

import { BUS_CHUNK, createFilterBank, bankSetValues, bankProcess, bankReset } from "./filterBank";
import { createFx, fxSetValues, fxProcess, fxReset } from "./fxChain";
import { createMaster, masterSetValues, masterProcess, masterReset, masterTakeGr } from "./master";

const SCOPE_LEN = 128;
const SCOPE_DECIM = 8;

export function createBus(sampleRate) {
  const sr = sampleRate > 0 ? sampleRate : 48000;
  return {
    sr,
    bank: createFilterBank(sr),
    fx: createFx(sr),
    master: createMaster(sr),
    peakL: 0, peakR: 0, sumL: 0, sumR: 0, count: 0,
    meters: { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0, gainReductionDb: 0 },
    scopeRing: new Float32Array(SCOPE_LEN),
    scopeOut: new Float32Array(SCOPE_LEN),
    scopePos: 0, scopeDecim: 0, scopeAcc: 0,
  };
}

export function busSetValues(bus, values) {
  bankSetValues(bus.bank, values);
  fxSetValues(bus.fx, values);
  masterSetValues(bus.master, values);
}

export function busPanic(bus) {
  bankReset(bus.bank);
  fxReset(bus.fx);
  masterReset(bus.master);
}

export function busProcess(bus, L, R, n) {
  // Sanitise the input so voices/layers can never poison filter or delay state.
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    if (!(l < 1e6 && l > -1e6)) L[i] = 0;
    if (!(r < 1e6 && r > -1e6)) R[i] = 0;
  }
  const bank = bus.bank, fx = bus.fx, master = bus.master;
  for (let off = 0; off < n; off += BUS_CHUNK) {
    const len = n - off < BUS_CHUNK ? n - off : BUS_CHUNK;
    bankProcess(bank, L, R, off, len);
    fxProcess(fx, L, R, off, len);
    masterProcess(master, L, R, off, len);
    if (master.bad) {
      busPanic(bus);
      for (let i = off; i < n; i++) { L[i] = 0; R[i] = 0; }
      break;
    }
  }

  // Meters + scope.
  let pL = bus.peakL, pR = bus.peakR, sL = bus.sumL, sR = bus.sumR;
  const ring = bus.scopeRing;
  let sp = bus.scopePos, sd = bus.scopeDecim;
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
    if (al > pL) pL = al;
    if (ar > pR) pR = ar;
    sL += l * l;
    sR += r * r;
    if (++sd >= SCOPE_DECIM) {
      sd = 0;
      ring[sp] = 0.5 * (l + r);
      sp = sp + 1 === SCOPE_LEN ? 0 : sp + 1;
    }
  }
  bus.peakL = pL; bus.peakR = pR; bus.sumL = sL; bus.sumR = sR; bus.count += n;
  bus.scopePos = sp; bus.scopeDecim = sd;
}

export function busMeters(bus) {
  const m = bus.meters;
  const c = bus.count > 0 ? bus.count : 1;
  m.peakL = bus.peakL;
  m.peakR = bus.peakR;
  m.rmsL = Math.sqrt(bus.sumL / c);
  m.rmsR = Math.sqrt(bus.sumR / c);
  m.gainReductionDb = masterTakeGr(bus.master);
  bus.peakL = 0; bus.peakR = 0; bus.sumL = 0; bus.sumR = 0; bus.count = 0;
  return m;
}

export function busScope(bus) {
  const out = bus.scopeOut, ring = bus.scopeRing;
  let p = bus.scopePos;
  for (let i = 0; i < SCOPE_LEN; i++) {
    out[i] = ring[p];
    p = p + 1 === SCOPE_LEN ? 0 : p + 1;
  }
  return out;
}
