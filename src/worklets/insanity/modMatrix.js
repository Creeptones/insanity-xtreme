// INSANITY worklet — the 64-slot mod matrix.
//
// A slot is (src index into MOD_SOURCES, dst index into MOD_DESTS, amount -1..1 in
// normalised destination units). Applied as
//   value = fromNorm(spec, toNorm(spec, base) + sum(amount * source))
//
// Destinations split in two:
//   * per-voice (params [0, VOICE_PARAM_END): groups osc + voice): computed once per
//     voice per control tick, with that voice's ENV / velocity / keytrack / noteRandom /
//     ampEnv / filterEnv plus the global sources.
//   * global (everything else): computed once per tick into `g`; per-voice sources feed
//     them from the most recently triggered voice.
//
// compileMatrix() runs only when params change; the per-tick apply loops touch only
// the slots that are live (src != none, amount != 0).

import { PARAMS, PARAM_COUNT, MOD_DESTS, MOD_SLOTS, toNorm, fromNorm } from "@/lib/insanity/params";
import { P, VOICE_PARAM_END } from "./pidx.js";
import { SRC_COUNT } from "./modSources.js";

export function createModMatrix() {
  return {
    // global-destination slots
    gCount: 0,
    gSrc: new Int32Array(MOD_SLOTS),
    gDst: new Int32Array(MOD_SLOTS),
    gAmt: new Float32Array(MOD_SLOTS),
    gTouched: new Int32Array(MOD_SLOTS),
    gTouchedCount: 0,
    // per-voice-destination slots
    vCount: 0,
    vSrc: new Int32Array(MOD_SLOTS),
    vDst: new Int32Array(MOD_SLOTS),
    vAmt: new Float32Array(MOD_SLOTS),
    vTouched: new Int32Array(MOD_SLOTS),
    vTouchedCount: 0,
    acc: new Float64Array(PARAM_COUNT),
    mark: new Uint8Array(PARAM_COUNT),
  };
}

/** Rebuild the live slot lists from the base values. */
export function compileMatrix(mm, base) {
  mm.gCount = 0;
  mm.vCount = 0;
  mm.gTouchedCount = 0;
  mm.vTouchedCount = 0;
  mm.mark.fill(0);
  for (let s = 0; s < MOD_SLOTS; s++) {
    const b = P.mod + s * P.modStride;
    const src = Math.round(base[b + P.mSrc]);
    const dstSel = Math.round(base[b + P.mDst]);
    const amt = base[b + P.mAmt];
    if (!(src > 0 && src < SRC_COUNT) || !(amt !== 0 && Number.isFinite(amt))) continue;
    if (!(dstSel >= 0 && dstSel < MOD_DESTS.length)) continue;
    const dst = MOD_DESTS[dstSel];
    if (dst < VOICE_PARAM_END) {
      mm.vSrc[mm.vCount] = src; mm.vDst[mm.vCount] = dst; mm.vAmt[mm.vCount] = amt; mm.vCount++;
      if (!mm.mark[dst]) { mm.mark[dst] = 1; mm.vTouched[mm.vTouchedCount++] = dst; }
    } else {
      mm.gSrc[mm.gCount] = src; mm.gDst[mm.gCount] = dst; mm.gAmt[mm.gCount] = amt; mm.gCount++;
      if (!mm.mark[dst]) { mm.mark[dst] = 1; mm.gTouched[mm.gTouchedCount++] = dst; }
    }
  }
}

/** Global destinations: g[d] = modulated value of base[d]. Other entries of g are left alone. */
export function applyGlobal(mm, base, g, src) {
  if (mm.gCount === 0) return;
  const acc = mm.acc;
  for (let t = 0; t < mm.gTouchedCount; t++) {
    const d = mm.gTouched[t];
    acc[d] = toNorm(PARAMS[d], base[d]);
  }
  for (let s = 0; s < mm.gCount; s++) acc[mm.gDst[s]] += mm.gAmt[s] * src[mm.gSrc[s]];
  for (let t = 0; t < mm.gTouchedCount; t++) {
    const d = mm.gTouched[t];
    const v = acc[d];
    g[d] = fromNorm(PARAMS[d], Number.isFinite(v) ? v : 0);
  }
}

/** Per-voice block: pv[0..VOICE_PARAM_END) = base, then the touched entries are modulated. */
export function applyVoice(mm, base, pv, src) {
  for (let i = 0; i < VOICE_PARAM_END; i++) pv[i] = base[i];
  if (mm.vCount === 0) return;
  const acc = mm.acc;
  for (let t = 0; t < mm.vTouchedCount; t++) {
    const d = mm.vTouched[t];
    acc[d] = toNorm(PARAMS[d], base[d]);
  }
  for (let s = 0; s < mm.vCount; s++) acc[mm.vDst[s]] += mm.vAmt[s] * src[mm.vSrc[s]];
  for (let t = 0; t < mm.vTouchedCount; t++) {
    const d = mm.vTouched[t];
    const v = acc[d];
    pv[d] = fromNorm(PARAMS[d], Number.isFinite(v) ? v : 0);
  }
}
