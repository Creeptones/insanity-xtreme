// GENERATED FILE — DO NOT EDIT.
// Source: src/worklets/pollen/  •  Rebuild: npm run build:worklet

"use strict";
(() => {
  // src/lib/pollen/audio/grainKernel.ts
  var DENSITY_LAW_EXPONENT = 0.7;
  var GAUSSIAN_SIGMA = 0.15;
  var CUTOFF_SPREAD_OCTAVES_MAX = 3;
  var TWO_PI = 2 * Math.PI;
  var TWO_POW_32 = 4294967296;
  var TUKY_ALPHA = 0.5;
  var TUKY_HALF = TUKY_ALPHA / 2;
  var BH_A0 = 0.35875;
  var BH_A1 = 0.48829;
  var BH_A2 = 0.14128;
  var BH_A3 = 0.01168;
  function window(shape, pos01) {
    const p = clamp01(pos01);
    switch (shape) {
      case "hann": {
        return 0.5 * (1 - Math.cos(TWO_PI * p));
      }
      case "triangle": {
        return 1 - 2 * Math.abs(p - 0.5);
      }
      case "rectangle": {
        return 1;
      }
      case "gaussian": {
        const t = (p - 0.5) / GAUSSIAN_SIGMA;
        return Math.exp(-0.5 * t * t);
      }
      case "tukey": {
        if (p < TUKY_HALF) {
          return 0.5 * (1 + Math.cos(Math.PI * (2 * p / TUKY_ALPHA - 1)));
        }
        if (p > 1 - TUKY_HALF) {
          return 0.5 * (1 + Math.cos(Math.PI * (2 * p / TUKY_ALPHA - 2 / TUKY_ALPHA + 1)));
        }
        return 1;
      }
      case "blackmanHarris": {
        return BH_A0 - BH_A1 * Math.cos(TWO_PI * p) + BH_A2 * Math.cos(2 * TWO_PI * p) - BH_A3 * Math.cos(3 * TWO_PI * p);
      }
      default: {
        return 1;
      }
    }
  }
  function hermite(ym1, y0, y1, y2, frac) {
    const f = clamp01(frac);
    const c0 = y0;
    const c1 = 0.5 * (y1 - ym1);
    const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
    const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * f + c2) * f + c1) * f + c0;
  }
  function xorshift32(state) {
    let x = state >>> 0;
    x ^= x << 13 >>> 0;
    x ^= x >>> 17 >>> 0;
    x ^= x << 5 >>> 0;
    const u = x >>> 0;
    return {
      value01: u / TWO_POW_32,
      nextState: u
    };
  }
  function onePoleCoeff(cutoffHz, sampleRate2) {
    const sr = Math.max(1, sampleRate2);
    const nyquist = 0.5 * sr;
    const cutoff = clamp(cutoffHz, 0, nyquist);
    return 1 - Math.exp(-2 * Math.PI * cutoff / sr);
  }
  function applyOnePole(input, state, coeff) {
    state.y += coeff * (input - state.y);
    return state.y;
  }
  function makeOnePoleState(initial = 0) {
    return { y: initial };
  }
  function svfCoeffs(cutoffHz, q, sampleRate2) {
    const sr = Math.max(1, sampleRate2);
    const fc = clamp(cutoffHz, 1, sr * 0.49);
    const g = Math.tan(Math.PI * fc / sr);
    const k = 1 / Math.max(1e-4, q);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    return { g, k, a1, a2, a3 };
  }
  function svfStep(state, coeffs, x, mode) {
    const { k, a1, a2, a3 } = coeffs;
    const v3 = x - state.ic2eq;
    const v1 = a1 * state.ic1eq + a2 * v3;
    const v2 = state.ic2eq + a2 * state.ic1eq + a3 * v3;
    state.ic1eq = 2 * v1 - state.ic1eq;
    state.ic2eq = 2 * v2 - state.ic2eq;
    switch (mode) {
      case "hp":
        return x - k * v1 - v2;
      case "bp":
        return v1;
      case "notch":
        return x - k * v1;
      default:
        return v2;
    }
  }
  function panGains(pan) {
    const clamped = clamp(pan, -1, 1);
    const theta = (clamped + 1) * (Math.PI / 4);
    return {
      l: Math.cos(theta),
      r: Math.sin(theta)
    };
  }
  function densityGain(activeGrains) {
    const n = Math.max(1, activeGrains);
    return 1 / Math.pow(n, DENSITY_LAW_EXPONENT * 0.5);
  }
  function baseInterval(sampleRate2, grainRateHz) {
    return sampleRate2 / Math.max(1e-12, grainRateHz);
  }
  function jitteredInterval(base, jitter01, rng01) {
    const clampedJitter = clamp01(jitter01);
    const interval = base * (1 + (clamp01(rng01) - 0.5) * 2 * clampedJitter);
    return Math.max(1e-12, interval);
  }
  function grainDurationSamples(sizeMs, sampleRate2) {
    return sizeMs / 1e3 * sampleRate2;
  }
  function pitchRatio(semitones) {
    return Math.pow(2, semitones / 12);
  }
  function sprayOffset(spray01, regionLen, rng01) {
    const clampedSpray = clamp01(spray01);
    return (clamp01(rng01) - 0.5) * 2 * clampedSpray * regionLen;
  }
  function renderGrainSample(grain, sourceL, sourceR, sampleRate2) {
    if (sourceL.length === 0 || sourceR.length === 0 || sampleRate2 <= 0) {
      grain.age += 1;
      return { l: 0, r: 0 };
    }
    if (!Number.isFinite(grain.durationSamples) || grain.durationSamples <= 0 || grain.age >= grain.durationSamples) {
      return { l: 0, r: 0 };
    }
    const pos01 = grain.age / grain.durationSamples;
    const env = window(grain.window, pos01);
    const sample = hermiteSampleStereo(sourceL, sourceR, grain.phase);
    const mixed = 0.5 * (sample.l + sample.r);
    const filtered = applyOnePole(mixed * env * grain.gain, grain.onePole, grain.filterCoeff);
    const gains = panGains(grain.pan);
    grain.phase += grain.playbackRate;
    grain.age += 1;
    return {
      l: filtered * gains.l,
      r: filtered * gains.r
    };
  }
  function hermiteSampleStereo(sourceL, sourceR, phase) {
    const floorIndex = Math.floor(phase);
    const frac = phase - floorIndex;
    return {
      l: hermite(
        sampleAt(sourceL, floorIndex - 1),
        sampleAt(sourceL, floorIndex),
        sampleAt(sourceL, floorIndex + 1),
        sampleAt(sourceL, floorIndex + 2),
        frac
      ),
      r: hermite(
        sampleAt(sourceR, floorIndex - 1),
        sampleAt(sourceR, floorIndex),
        sampleAt(sourceR, floorIndex + 1),
        sampleAt(sourceR, floorIndex + 2),
        frac
      )
    };
  }
  function sampleAt(buffer, index) {
    const safeIndex = clamp(index, 0, buffer.length - 1);
    return buffer[safeIndex];
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  // src/worklets/pollen/grainPool.js
  var MAX_GRAINS = 512;
  function makeGrain() {
    return {
      window: "hann",
      durationSamples: 0,
      playbackRate: 1,
      pan: 0,
      gain: 1,
      filterCoeff: 0,
      phase: 0,
      age: 0,
      onePole: makeOnePoleState(0)
    };
  }
  function createGrainPool(capacity) {
    const max = Math.max(1, Math.min(MAX_GRAINS, capacity | 0));
    const grains = new Array(max);
    for (let i = 0; i < max; i++) {
      grains[i] = makeGrain();
    }
    return {
      max,
      grains,
      nextSlot: 0
    };
  }
  function spawnGrain(pool, sampleRate2, grainParams) {
    if (!pool || !grainParams) return;
    const slot = pool.nextSlot;
    const g = pool.grains[slot];
    if (!g) return;
    pool.nextSlot = (pool.nextSlot + 1) % pool.max;
    g.window = grainParams.window || "hann";
    const ms = grainParams.durationMs;
    g.durationSamples = Math.max(1, grainDurationSamples(ms, sampleRate2));
    g.playbackRate = Number.isFinite(grainParams.playbackRate) ? grainParams.playbackRate : 1;
    g.pan = Number.isFinite(grainParams.pan) ? grainParams.pan : 0;
    g.gain = Number.isFinite(grainParams.gain) ? grainParams.gain : 1;
    g.filterCoeff = Number.isFinite(grainParams.filterCoeff) ? grainParams.filterCoeff : 0;
    g.phase = Number.isFinite(grainParams.phase) ? grainParams.phase : 0;
    g.age = 0;
    g.onePole.y = 0;
    return g;
  }
  function renderGrainBlock(pool, sourceL, sourceR, sampleRate2, densityNorm, out) {
    let left = 0;
    let right = 0;
    let active = 0;
    if (!pool || !pool.grains) {
      const target2 = out || {
        left,
        right,
        activeGrains: 0,
        density: 1
      };
      target2.left = left;
      target2.right = right;
      target2.activeGrains = 0;
      target2.density = 1;
      return target2;
    }
    for (let i = 0; i < pool.max; i++) {
      const g = pool.grains[i];
      if (!g || g.durationSamples <= 0 || g.age >= g.durationSamples) continue;
      const sample = renderGrainSample(g, sourceL, sourceR, sampleRate2);
      left += sample.l;
      right += sample.r;
      active += 1;
    }
    const density = densityNorm ? densityGain(active) : 1;
    const target = out || {};
    target.left = left * density;
    target.right = right * density;
    target.activeGrains = active;
    target.density = density;
    return target;
  }
  function resetGrainPool(pool) {
    if (!pool || !pool.grains) return;
    for (const g of pool.grains) {
      g.durationSamples = 0;
      g.age = 0;
      g.phase = 0;
      g.onePole.y = 0;
    }
  }

  // src/worklets/pollen/fx.js
  var TWO_PI2 = Math.PI * 2;
  var MIN_DELAY_SAMPLES = 16;
  var DENORMAL_EPS = 1e-30;
  function clamp2(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
  function clamp012(value) {
    return clamp2(value, 0, 1);
  }
  function clampDb(value) {
    return Number.isFinite(value) ? Math.min(24, Math.max(-24, value)) : 0;
  }
  function dbToLinear(db) {
    if (!Number.isFinite(db)) return 1;
    return Math.pow(10, db / 20);
  }
  function quantizeSample(sample, bitDepth) {
    const levels = Math.max(1, Math.pow(2, Math.max(4, Math.min(16, bitDepth))));
    const scale = levels - 1;
    return Math.round(sample * scale) / scale;
  }
  function flushDenormal(value) {
    return Number.isFinite(value) && value !== 0 && Math.abs(value) < DENORMAL_EPS ? 0 : value;
  }
  function makeRing(size) {
    const max = Math.max(MIN_DELAY_SAMPLES, Math.floor(size));
    return {
      bufferL: new Float32Array(max + 1),
      bufferR: new Float32Array(max + 1),
      write: 0,
      size: max
    };
  }
  function ensureRing(ring, sizeSamples) {
    const size = Math.max(MIN_DELAY_SAMPLES, Math.floor(sizeSamples));
    if (!ring || ring.size === size) return;
    ring.bufferL = new Float32Array(size + 1);
    ring.bufferR = new Float32Array(size + 1);
    ring.write = 0;
    ring.size = size;
  }
  function ringRead(ring, sampleOffset, channel) {
    const idx = (ring.write - sampleOffset + ring.size + 1) % (ring.size + 1);
    const buffer = channel === "r" ? ring.bufferR : ring.bufferL;
    return buffer ? flushDenormal(buffer[idx]) : 0;
  }
  function ringWrite(ring, sampleL, sampleR) {
    ring.bufferL[ring.write] = flushDenormal(sampleL);
    ring.bufferR[ring.write] = flushDenormal(sampleR);
    ring.write += 1;
    if (ring.write > ring.size) ring.write = 0;
  }
  function mixDryWet(dry, wet, mix) {
    const m = clamp012(mix);
    return dry * (1 - m) + wet * m;
  }
  function applyDrive(sample, params) {
    if (!params.enabled) return sample;
    const gain = dbToLinear(params.db);
    const saturation = params.saturation;
    const shaped = Math.tanh(sample * gain * saturation) * (1 / saturation);
    const quantized = params.bitDepth > 0 ? quantizeSample(shaped, params.bitDepth) : shaped;
    return mixDryWet(sample, quantized, params.mix);
  }
  function applyDelay(sampleL, sampleR, params, state) {
    if (!params.enabled || !state.delay) return { l: sampleL, r: sampleR };
    const dryL = sampleL;
    const dryR = sampleR;
    ensureRing(state.delay.ring, params.timeSamples);
    const wetL = ringRead(state.delay.ring, params.timeSamples, "l");
    const wetR = ringRead(state.delay.ring, params.timeSamples + 1, "r");
    const fb = clamp012(params.feedback);
    const damp = clamp012(params.damping);
    const feedbackL = params.lowPassL = flushDenormal(params.lowPassL * (1 - damp) + wetL * damp);
    const feedbackR = params.lowPassR = flushDenormal(params.lowPassR * (1 - damp) + wetR * damp);
    const outL = mixDryWet(dryL, wetL, params.mix);
    const outR = mixDryWet(dryR, wetR, params.mix);
    ringWrite(state.delay.ring, dryL + feedbackL * fb, dryR + feedbackR * fb);
    return { l: outL, r: outR };
  }
  function applyChorus(sampleL, sampleR, params, state) {
    if (!params.enabled || !state.chorus) return { l: sampleL, r: sampleR };
    const dryL = sampleL;
    const dryR = sampleR;
    const rate = clamp2(params.rateHz, 0.05, 6);
    const depthMs = clamp2(params.depth, 0, 1) * 8;
    const baseMs = clamp2(params.delayMs, 1, 30);
    const phaseInc = rate / state.sampleRate;
    const lfo = Math.sin(TWO_PI2 * state.chorus.phase) * depthMs;
    const ms = baseMs + lfo;
    state.chorus.phase = (state.chorus.phase + phaseInc) % 1;
    const delaySamples = Math.max(1, Math.round(ms * 1e-3 * state.sampleRate));
    ensureRing(state.chorus.ring, delaySamples + 4);
    const wetL = ringRead(state.chorus.ring, delaySamples, "l");
    const wetR = ringRead(state.chorus.ring, delaySamples + 1, "r");
    ringWrite(state.chorus.ring, dryL, dryR);
    return {
      l: mixDryWet(dryL, wetL, params.mix),
      r: mixDryWet(dryR, wetR, params.mix)
    };
  }
  function applyReverb(sampleL, sampleR, params, state) {
    if (!params.enabled || !state.reverb) return { l: sampleL, r: sampleR };
    const lowPassCoeff = clamp012(params.damping);
    const size = clamp012(params.size);
    const dryL = sampleL;
    const dryR = sampleR;
    const t60 = 1e-3 * (2 + size * 6);
    const decay = clamp2(Math.exp(-1 / (Math.max(1, t60) * state.sampleRate)), 0, 0.999);
    const delayed = ringRead(state.reverb.ring, clamp2(Math.round(state.reverb.sizeMs * state.sampleRate * 1e-3), MIN_DELAY_SAMPLES, state.reverb.ring.size), "l");
    const wetL = delayed * decay;
    const wetR = ringRead(state.reverb.ring, clamp2(Math.round(state.reverb.sizeMs * state.sampleRate * 1e-3), MIN_DELAY_SAMPLES, state.reverb.ring.size) + 1, "r");
    state.reverb.feedbackL = flushDenormal(state.reverb.feedbackL * (1 - lowPassCoeff) + wetL * lowPassCoeff);
    state.reverb.feedbackR = flushDenormal(state.reverb.feedbackR * (1 - lowPassCoeff) + wetR * lowPassCoeff);
    ringWrite(state.reverb.ring, dryL + state.reverb.feedbackL * 0.2, dryR + state.reverb.feedbackR * 0.2);
    return {
      l: mixDryWet(dryL, wetL, params.mix),
      r: mixDryWet(dryR, wetR, params.mix)
    };
  }
  function createFxState() {
    return {
      enabled: false,
      sampleRate: 48e3,
      drive: {
        enabled: false,
        db: 2,
        mix: 1,
        bitDepth: 16,
        saturation: 0.7
      },
      chorus: {
        enabled: false,
        rateHz: 0.25,
        depth: 0.2,
        delayMs: 8,
        mix: 0,
        phase: 0,
        ring: makeRing(800)
      },
      delay: {
        enabled: false,
        timeMs: 175,
        feedback: 0.25,
        damping: 0.4,
        mix: 0,
        timeSamples: 0,
        lowPassL: 0,
        lowPassR: 0,
        ring: makeRing(24e3)
      },
      reverb: {
        enabled: false,
        size: 0.5,
        damping: 0.5,
        mix: 0,
        feedbackL: 0,
        feedbackR: 0,
        sizeMs: 1200,
        ring: makeRing(9600)
      }
    };
  }
  function applyFx(sampleL, sampleR, state) {
    if (!state || !state.enabled) return { l: sampleL, r: sampleR };
    const chorusParams = state.chorus || {};
    const delayParams = state.delay || {};
    const driveParams = state.drive || {};
    const reverbParams = state.reverb || {};
    state.sampleRate = state.sampleRate > 0 ? state.sampleRate : 48e3;
    let out = {
      l: sampleL,
      r: sampleR
    };
    if (chorusParams.enabled || chorusParams.mix > 0) {
      out = applyChorus(out.l, out.r, chorusParams, { ...state, chorus: state.chorus });
    }
    if (delayParams.enabled || delayParams.mix > 0) {
      out = applyDelay(out.l, out.r, delayParams, { ...state, delay: state.delay });
    }
    if (driveParams.enabled || driveParams.mix > 0) {
      out = {
        l: applyDrive(out.l, driveParams),
        r: applyDrive(out.r, driveParams)
      };
    }
    if (reverbParams.enabled || reverbParams.mix > 0) {
      out = applyReverb(out.l, out.r, reverbParams, { ...state, reverb: state.reverb });
    }
    return out;
  }
  function setFxParams(state, params) {
    if (!state || typeof params !== "object" || params === null) return;
    if (typeof params.enabled === "boolean") {
      state.enabled = params.enabled;
    }
    if (typeof params.sampleRate === "number" && Number.isFinite(params.sampleRate)) {
      state.sampleRate = params.sampleRate;
    }
    if (params.drive && typeof params.drive === "object") {
      const input = params.drive;
      state.drive = {
        ...state.drive,
        enabled: input.enabled === true,
        db: clampDb(input.db),
        mix: clamp012(input.mix ?? 1),
        bitDepth: Math.max(4, Math.min(16, Math.round(input.bitDepth ?? 16))),
        saturation: clamp2(input.saturation, 0.05, 1)
      };
    }
    if (params.chorus && typeof params.chorus === "object") {
      const input = params.chorus;
      const enabled = input.enabled === true;
      const delayMs = clamp2(input.delayMs, 1, 30);
      state.chorus = {
        ...state.chorus,
        enabled,
        rateHz: clamp2(input.rateHz, 0.05, 6),
        depth: clamp012(input.depth),
        delayMs,
        mix: clamp012(input.mix),
        phase: state.chorus.phase,
        ring: state.chorus.ring ?? makeRing(800)
      };
    }
    if (params.delay && typeof params.delay === "object") {
      const input = params.delay;
      const enabled = input.enabled === true;
      const timeMs = clamp2(input.timeMs, 15, 1200);
      state.delay = {
        ...state.delay,
        enabled,
        timeMs,
        timeSamples: Math.max(MIN_DELAY_SAMPLES, Math.round(timeMs * 1e-3 * (state.sampleRate > 0 ? state.sampleRate : 48e3))),
        feedback: clamp2(input.feedback, 0, 0.98),
        damping: clamp012(input.damping),
        mix: clamp012(input.mix),
        ring: state.delay.ring ?? makeRing(24e3),
        lowPassL: 0,
        lowPassR: 0
      };
    }
    if (params.reverb && typeof params.reverb === "object") {
      const input = params.reverb;
      const enabled = input.enabled === true;
      const size = clamp2(input.size, 0, 1);
      state.reverb = {
        ...state.reverb,
        enabled,
        size,
        damping: clamp012(input.damping),
        mix: clamp012(input.mix),
        sizeMs: clamp2(1200 * (0.2 + 0.8 * size), 200, 2400),
        ring: state.reverb.ring ?? makeRing(9600),
        feedbackL: 0,
        feedbackR: 0
      };
      ensureRing(state.reverb.ring, Math.round(state.reverb.sizeMs * 1e-3 * (state.sampleRate > 0 ? state.sampleRate : 48e3)) + 4);
    }
  }

  // src/worklets/pollen/modMatrix.js
  var MOD_MATRIX_SLOT_COUNT = 8;
  var SOURCE_SCALE = {
    position: 0.45,
    grainSizeMs: 0.25,
    grainRateHz: 0.18,
    pitch: 7,
    filterCutoff: 6,
    pan: 0.7,
    width: 0.3
  };
  function clamp3(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
  function clamp013(value) {
    return clamp3(value, 0, 1);
  }
  function safeRouteArray(raw) {
    const list = Array.isArray(raw && raw.routes ? raw.routes : raw) ? raw && raw.routes ? raw.routes : raw : [];
    const out = [];
    for (let i = 0; i < list.length && i < MOD_MATRIX_SLOT_COUNT; i++) {
      const route = list[i];
      if (!route || typeof route !== "object") continue;
      const source = route.source === "lfo1" || route.source === "lfo2" || route.source === "lfo3" || route.source === "filterEnv" || route.source === "velocity" || route.source === "modWheel" || route.source === "aftertouch" ? route.source : "lfo1";
      const destination = route.destination === "position" || route.destination === "grainSize" || route.destination === "grainRate" || route.destination === "pitch" || route.destination === "filterCutoff" || route.destination === "pan" || route.destination === "width" ? route.destination : "position";
      out.push({
        enabled: route.enabled === true,
        source,
        destination,
        depth: clamp3(route.depth, -1, 1)
      });
    }
    return out;
  }
  function sampleSource(source, values) {
    switch (source) {
      case "lfo1":
        return clamp3(values.lfo[0] ?? 0, -1, 1);
      case "lfo2":
        return clamp3(values.lfo[1] ?? 0, -1, 1);
      case "lfo3":
        return clamp3(values.lfo[2] ?? 0, -1, 1);
      case "filterEnv":
        return clamp3(values.filterEnv, -1, 1);
      case "velocity":
        return clamp3(values.velocity, -1, 1);
      case "modWheel":
        return clamp3(values.modWheel, -1, 1);
      case "aftertouch":
        return clamp3(values.aftertouch, -1, 1);
      default:
        return 0;
    }
  }
  function addDelta(base, destination, amount) {
    switch (destination) {
      case "position":
        base.position += amount * SOURCE_SCALE.position;
        break;
      case "grainSize":
        base.grainSizeMs += amount * SOURCE_SCALE.grainSizeMs;
        break;
      case "grainRate":
        base.grainRateHz += amount * SOURCE_SCALE.grainRateHz;
        break;
      case "pitch":
        base.pitch += amount * SOURCE_SCALE.pitch;
        break;
      case "filterCutoff":
        base.filterCutoff += amount * SOURCE_SCALE.filterCutoff;
        break;
      case "pan":
        base.pan += amount * SOURCE_SCALE.pan;
        break;
      case "width":
        base.width += amount * SOURCE_SCALE.width;
        break;
      default:
        break;
    }
  }
  function normalizeModValues(values) {
    const lfo = Array.isArray(values.lfo) ? values.lfo : [];
    return {
      lfo: [lfo[0] ?? 0, lfo[1] ?? 0, lfo[2] ?? 0],
      filterEnv: Number.isFinite(values.filterEnv) ? clamp3(values.filterEnv, -1, 1) : 0,
      velocity: clamp013(values.velocity ?? 0),
      modWheel: clamp013(values.modWheel ?? 0),
      aftertouch: clamp013(values.aftertouch ?? 0)
    };
  }
  function applyModMatrixToParams(base, matrix, values) {
    const routes = safeRouteArray(matrix);
    const state = normalizeModValues(values ?? {});
    const out = {
      position: base.position,
      grainSizeMs: base.grainSizeMs,
      grainRateHz: base.grainRateHz,
      pitch: base.pitch,
      filterCutoff: base.filterCutoff,
      pan: base.pan,
      width: base.width
    };
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (!route.enabled) continue;
      const sourceValue = sampleSource(route.source, state);
      addDelta(out, route.destination, route.depth * sourceValue);
    }
    return {
      position: clamp3(out.position, 0, 1),
      grainSizeMs: Math.max(1, out.grainSizeMs),
      grainRateHz: Math.max(1e-3, out.grainRateHz),
      pitch: out.pitch,
      filterCutoff: Math.max(1, out.filterCutoff),
      pan: clamp3(out.pan, -1, 1),
      width: clamp3(out.width, 0, 2)
    };
  }

  // src/worklets/pollen/lfo.js
  var TWO_PI3 = 2 * Math.PI;
  var DEFAULT_RATE_HZ = 0.5;
  function createLfoState() {
    const slots = [];
    for (let i = 0; i < 3; i++) {
      slots.push({
        enabled: false,
        phase: 0,
        value: 0,
        shape: "sine",
        rateHz: DEFAULT_RATE_HZ,
        amount: 0.25,
        sync: false,
        syncNumerator: 1,
        syncDenominator: 4
      });
    }
    return slots;
  }
  function clamp4(value, min, max) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  }
  function wave(shape, phase01) {
    const p = (phase01 % 1 + 1) % 1;
    switch (shape) {
      case "triangle":
        return (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * 0.999999;
      case "sawUp":
        return 2 * p - 1;
      case "sawDown":
        return 1 - 2 * p;
      case "square":
        return p < 0.5 ? -1 : 1;
      case "random":
        return Math.sign(Math.sin(p * Math.PI * 7 + 13.37));
      case "sine":
      default:
        return Math.sin(TWO_PI3 * p);
    }
  }
  function tickOne(state, sampleRate2) {
    const sr = sampleRate2 > 0 ? sampleRate2 : 48e3;
    const inc = clamp4(state.rateHz / sr, 0, 0.5);
    state.phase += inc;
    if (state.phase > 1) {
      state.phase -= Math.floor(state.phase);
    }
    state.value = clamp4(wave(state.shape, state.phase), -1, 1) * state.amount;
    return state.value;
  }
  function lfoTick(state, sampleRate2) {
    if (!Array.isArray(state)) return [0, 0, 0];
    const first = state[0] && tickOne(state[0], sampleRate2) || 0;
    const second = state[1] && tickOne(state[1], sampleRate2) || 0;
    const third = state[2] && tickOne(state[2], sampleRate2) || 0;
    return [first, second, third];
  }

  // src/worklets/pollen/filterSvf.js
  function createSvfState() {
    return {
      enabled: false,
      cutoff: 1e3,
      sampleRate: 48e3,
      type: "lp",
      resonance: 0.8,
      // Per-channel integrator memory (Cytomic ic1eq/ic2eq) — L and R must not share
      // state or stereo filtering cross-contaminates.
      chan: [
        { ic1eq: 0, ic2eq: 0 },
        { ic1eq: 0, ic2eq: 0 }
      ],
      // Cached coefficients (recomputed at control rate via commitSvfCoeffs).
      g: 0,
      k: 0,
      a1: 0,
      a2: 0,
      a3: 0,
      coeffDirty: true,
      y: 0
    };
  }
  function recompute(state) {
    const c = svfCoeffs(state.cutoff, state.resonance, state.sampleRate);
    state.g = c.g;
    state.k = c.k;
    state.a1 = c.a1;
    state.a2 = c.a2;
    state.a3 = c.a3;
    state.coeffDirty = false;
  }
  function commitSvfCoeffs(state) {
    if (!state) return;
    if (state.coeffDirty) recompute(state);
  }
  function setSvfCutoff(state, cutoff) {
    if (!state || !Number.isFinite(cutoff)) return;
    const sr = state.sampleRate > 0 ? state.sampleRate : 48e3;
    const next = Math.max(1, Math.min(sr * 0.49, cutoff));
    if (next !== state.cutoff) {
      state.cutoff = next;
      state.coeffDirty = true;
    }
  }
  function applySvf(sample, state, channel = 0) {
    if (!state || !state.enabled) return sample;
    if (state.coeffDirty) recompute(state);
    const ic = state.chan[channel === 1 ? 1 : 0];
    const out = svfStep(ic, state, sample, state.type);
    state.y = out;
    return out;
  }
  function setSvfParams(state, params) {
    if (!state || typeof params !== "object" || params === null) return;
    if (typeof params.enabled === "boolean") {
      state.enabled = params.enabled;
    } else if (Object.prototype.hasOwnProperty.call(params, "type") || Object.prototype.hasOwnProperty.call(params, "cutoff") || Object.prototype.hasOwnProperty.call(params, "resonance")) {
      state.enabled = true;
    }
    if (typeof params.type === "string") {
      state.type = params.type === "lp" || params.type === "hp" || params.type === "bp" || params.type === "notch" ? params.type : "lp";
    }
    if (typeof params.cutoff === "number" && Number.isFinite(params.cutoff)) {
      state.cutoff = params.cutoff;
      state.coeffDirty = true;
    }
    if (typeof params.sampleRate === "number" && Number.isFinite(params.sampleRate)) {
      state.sampleRate = params.sampleRate;
      state.coeffDirty = true;
    }
    if (typeof params.resonance === "number" && Number.isFinite(params.resonance)) {
      state.resonance = params.resonance;
      state.coeffDirty = true;
    }
    if (params.resonance === 0) {
      state.resonance = 0;
      state.coeffDirty = true;
    }
  }

  // src/worklets/pollen/scheduler.js
  var MIN_GRAIN_RATE = 1e-3;
  function clamp014(value) {
    return Math.min(1, Math.max(0, value));
  }
  function clamp5(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function validateWindow(value) {
    if (value === "hann" || value === "triangle" || value === "rectangle" || value === "gaussian" || value === "tukey" || value === "blackmanHarris") {
      return value;
    }
    return "hann";
  }
  function createScheduler(sampleRate2, defaults = {}) {
    const safeSampleRate = Number.isFinite(sampleRate2) && sampleRate2 > 0 ? sampleRate2 : 48e3;
    return {
      sampleRate: safeSampleRate,
      seed: 305419896 >>> 0,
      nextInterval: 0,
      sourceCursor: 0,
      frozenSourceCursor: 0,
      sourceCursorRate: 1,
      params: {
        grainRateHz: 12,
        grainSizeMs: 40,
        spray: 0.2,
        scheduleJitter: 0.35,
        pitch: 0,
        pitchJitter: 0,
        position: 0.5,
        pan: 0,
        panSpread: 0.2,
        window: "hann",
        direction: 1,
        freeze: false,
        densityNorm: true,
        filterCutoff: 1e3,
        filterSpread: 0,
        // Negative means derive the per-grain one-pole coefficient from the
        // authored cutoff/spread. Zero is an explicit coefficient and therefore
        // exact silence; it must remain reachable only when a caller sends it.
        filterCoeff: -1,
        masterGain: 1,
        ...defaults
      }
    };
  }
  function stepRng(scheduler) {
    const out = xorshift32(scheduler.seed);
    scheduler.seed = out.nextState;
    return out.value01;
  }
  function calcFilterCoeff(scheduler, rng01) {
    if (typeof scheduler.params.filterCoeff === "number" && Number.isFinite(scheduler.params.filterCoeff) && scheduler.params.filterCoeff >= 0) {
      return scheduler.params.filterCoeff;
    }
    const cutoffBase = clamp5(scheduler.params.filterCutoff, 1, scheduler.sampleRate * 0.5);
    const spread = Math.max(0, Math.min(CUTOFF_SPREAD_OCTAVES_MAX, scheduler.params.filterSpread || 0));
    const oct = (clamp014(rng01) - 0.5) * 2 * spread;
    const cutoff = cutoffBase * Math.pow(2, oct);
    return onePoleCoeff(cutoff, scheduler.sampleRate);
  }
  function updateSchedulerParams(scheduler, params = {}) {
    if (!scheduler || !params) return;
    const p = scheduler.params;
    if (typeof params.grainRateHz === "number" && Number.isFinite(params.grainRateHz)) {
      p.grainRateHz = Math.max(MIN_GRAIN_RATE, params.grainRateHz);
    }
    if (typeof params.grainSizeMs === "number" && Number.isFinite(params.grainSizeMs)) {
      p.grainSizeMs = Math.max(0.1, params.grainSizeMs);
    }
    if (typeof params.spray === "number" && Number.isFinite(params.spray)) {
      p.spray = clamp014(params.spray);
    }
    if (typeof params.jitter === "number" && Number.isFinite(params.jitter)) {
      p.scheduleJitter = clamp014(params.jitter);
    }
    if (typeof params.scheduleJitter === "number" && Number.isFinite(params.scheduleJitter)) {
      p.scheduleJitter = clamp014(params.scheduleJitter);
    }
    if (typeof params.pitch === "number" && Number.isFinite(params.pitch)) {
      p.pitch = params.pitch;
    }
    if (typeof params.pitchJitter === "number" && Number.isFinite(params.pitchJitter)) {
      p.pitchJitter = clamp014(params.pitchJitter);
    }
    if (typeof params.position === "number" && Number.isFinite(params.position)) {
      p.position = clamp5(params.position, 0, 1);
    }
    if (typeof params.pan === "number" && Number.isFinite(params.pan)) {
      p.pan = clamp5(params.pan, -1, 1);
    }
    if (typeof params.panSpread === "number" && Number.isFinite(params.panSpread)) {
      p.panSpread = clamp014(params.panSpread);
    }
    if (typeof params.window === "string") {
      p.window = validateWindow(params.window);
    }
    if (typeof params.direction === "number" && Number.isFinite(params.direction)) {
      p.direction = params.direction === 0 ? 0 : params.direction > 0 ? 1 : -1;
    }
    if (typeof params.sourceCursorRate === "number" && Number.isFinite(params.sourceCursorRate)) {
      scheduler.sourceCursorRate = params.sourceCursorRate;
    }
    if (typeof params.freeze === "boolean") {
      if (params.freeze && !p.freeze) {
        scheduler.frozenSourceCursor = scheduler.sourceCursor;
      }
      p.freeze = params.freeze;
    }
    if (typeof params.densityNorm === "boolean") {
      p.densityNorm = params.densityNorm;
    }
    if (typeof params.filterCutoff === "number" && Number.isFinite(params.filterCutoff)) {
      p.filterCutoff = clamp5(params.filterCutoff, 1, scheduler.sampleRate * 0.5);
    }
    if (typeof params.filterSpread === "number" && Number.isFinite(params.filterSpread)) {
      p.filterSpread = clamp5(params.filterSpread, 0, CUTOFF_SPREAD_OCTAVES_MAX);
    }
    if (typeof params.filterCoeff === "number" && Number.isFinite(params.filterCoeff)) {
      p.filterCoeff = params.filterCoeff;
    }
    if (typeof params.masterGain === "number" && Number.isFinite(params.masterGain)) {
      p.masterGain = params.masterGain;
    }
  }
  function scheduleTick(scheduler, sourceLength, spawnGrain2) {
    const p = scheduler.params;
    if (!p || p.grainRateHz <= 0 || typeof spawnGrain2 !== "function") {
      return;
    }
    scheduler.nextInterval -= 1;
    const base = baseInterval(scheduler.sampleRate, p.grainRateHz);
    while (scheduler.nextInterval <= 0) {
      const jitter01 = stepRng(scheduler);
      const interval = jitteredInterval(base, p.scheduleJitter, jitter01);
      scheduler.nextInterval += interval;
      const spawn = buildGrainSpec(scheduler, sourceLength);
      if (spawn) {
        spawnGrain2(spawn);
      }
    }
  }
  function buildGrainSpec(scheduler, sourceLength) {
    const p = scheduler.params;
    if (!Number.isFinite(sourceLength) || sourceLength <= 0) return null;
    const spray01 = stepRng(scheduler);
    const pitchJitter01 = stepRng(scheduler);
    const panJitter01 = stepRng(scheduler);
    const filter01 = stepRng(scheduler);
    const grainDir = p.direction === 0 ? stepRng(scheduler) < 0.5 ? -1 : 1 : p.direction;
    const center = p.freeze ? scheduler.frozenSourceCursor : scheduler.sourceCursor;
    const anchor = p.position * sourceLength;
    const phaseOffset = sprayOffset(p.spray, sourceLength * p.spray, spray01);
    const phase = ((center + anchor + phaseOffset) % sourceLength + sourceLength) % sourceLength;
    const jitterPitch = (pitchJitter01 - 0.5) * 2 * p.pitchJitter;
    const playbackRate = grainDir * pitchRatio(p.pitch + jitterPitch);
    const pan = clamp5(p.pan + (panJitter01 - 0.5) * 2 * p.panSpread, -1, 1);
    const filterCoeff = calcFilterCoeff(scheduler, filter01);
    return {
      window: p.window,
      durationMs: p.grainSizeMs,
      playbackRate,
      pan,
      gain: p.masterGain,
      filterCoeff,
      phase
    };
  }
  function advanceSourceCursor(scheduler, sourceLength, frames = 1) {
    if (!scheduler || !Number.isFinite(sourceLength) || sourceLength <= 0) return;
    if (scheduler.params && scheduler.params.freeze) return;
    const rate = Number.isFinite(scheduler.sourceCursorRate) ? scheduler.sourceCursorRate : 1;
    const steps = Number.isFinite(frames) && frames > 0 ? frames : 1;
    scheduler.sourceCursor = ((scheduler.sourceCursor + rate * steps) % sourceLength + sourceLength) % sourceLength;
  }

  // src/worklets/pollen/voice.js
  function createVoice() {
    return {
      attackSamples: 1,
      decaySamples: 1,
      sustainLevel: 1,
      releaseSamples: 1,
      state: "sustain",
      value: 1,
      targetSustain: 1,
      releaseStartValue: 0
    };
  }
  function clamp015(value) {
    return Math.min(1, Math.max(0, value));
  }
  function safeSamples(seconds, sampleRate2) {
    if (!Number.isFinite(seconds) || seconds <= 0) return 1;
    const samples = Math.round(seconds * sampleRate2);
    return samples > 1 ? samples : 1;
  }
  function voiceNoteOn(voice) {
    if (!voice) return;
    if (typeof voice.value !== "number" || !Number.isFinite(voice.value)) {
      voice.value = 0;
    }
    voice.state = "attack";
    voice.value = 0;
    voice.releaseStartValue = voice.value;
  }
  function voiceNoteOff(voice) {
    if (!voice) return;
    if (voice.state === "release" || voice.state === "off") return;
    voice.state = "release";
    voice.releaseStartValue = voice.value;
  }
  function setAdsr(voice, payload, sampleRate2) {
    if (!voice) return;
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.attack === "number" && Number.isFinite(payload.attack)) {
      voice.attackSamples = safeSamples(Math.max(0, payload.attack), sampleRate2);
    }
    if (typeof payload.decay === "number" && Number.isFinite(payload.decay)) {
      voice.decaySamples = safeSamples(Math.max(0, payload.decay), sampleRate2);
    }
    if (typeof payload.sustain === "number" && Number.isFinite(payload.sustain)) {
      voice.targetSustain = clamp015(payload.sustain);
    }
    if (typeof payload.release === "number" && Number.isFinite(payload.release)) {
      voice.releaseSamples = safeSamples(Math.max(0, payload.release), sampleRate2);
    }
  }
  function setupVoiceAdsrDefaults(voice, sampleRate2) {
    if (!voice) return;
    voice.attackSamples = safeSamples(1e-3, sampleRate2);
    voice.decaySamples = safeSamples(0.03, sampleRate2);
    voice.sustainLevel = 1;
    voice.releaseSamples = safeSamples(0.05, sampleRate2);
    voice.state = "sustain";
    voice.value = 1;
    voice.targetSustain = 1;
    voice.releaseStartValue = 0;
  }
  function voiceAdvance(voice) {
    if (!voice || !voice.state) return 0;
    switch (voice.state) {
      case "attack": {
        if (voice.attackSamples <= 1) {
          voice.value = 1;
          voice.state = "decay";
          return voice.value;
        }
        voice.value += 1 / voice.attackSamples;
        if (voice.value >= 1) {
          voice.value = 1;
          voice.state = "decay";
        }
        return voice.value;
      }
      case "decay": {
        if (voice.decaySamples <= 1) {
          voice.value = voice.targetSustain;
          voice.state = "sustain";
          return voice.value;
        }
        const slope = (1 - voice.targetSustain) / voice.decaySamples;
        voice.value -= slope;
        if (voice.value <= voice.targetSustain) {
          voice.value = voice.targetSustain;
          voice.state = "sustain";
        }
        return voice.value;
      }
      case "sustain":
        voice.value = voice.targetSustain;
        return voice.value;
      case "release": {
        if (voice.releaseSamples <= 1) {
          voice.value = 0;
          voice.state = "off";
          return 0;
        }
        const slope = voice.releaseStartValue / voice.releaseSamples;
        voice.value -= slope;
        if (voice.value <= 0) {
          voice.value = 0;
          voice.state = "off";
        }
        return voice.value;
      }
      case "off":
        return 0;
      default:
        return 0;
    }
  }

  // src/worklets/pollen/msgRouter.js
  var DENORMAL_EPS2 = 1e-300;
  function flush(value) {
    return typeof value === "number" && Number.isFinite(value) && Math.abs(value) < DENORMAL_EPS2 ? 0 : value;
  }
  function dbToLinear2(db) {
    if (typeof db !== "number" || !Number.isFinite(db)) return Number.NaN;
    if (db <= -160) return 0;
    return Math.pow(10, db / 20);
  }
  function asBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }
  function asNumber(value, fallback, min = -Infinity, max = Infinity) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }
  function normalizeWindow(value) {
    if (value === "hann" || value === "triangle" || value === "rectangle" || value === "gaussian" || value === "tukey" || value === "blackmanHarris") {
      return value;
    }
    return null;
  }
  function asSourceArray(value) {
    if (value instanceof Float32Array) return value;
    if (value instanceof Float64Array) return new Float32Array(value);
    if (value instanceof ArrayBuffer) return new Float32Array(value);
    if (ArrayBuffer.isView(value)) {
      if (value instanceof Float64Array) return new Float32Array(value);
      return new Float32Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    return null;
  }
  function createMsgRouter(processor) {
    return {
      setSource(message) {
        const left = asSourceArray(message.sourceL);
        if (!left) return;
        const right = asSourceArray(message.sourceR) ?? left;
        processor.sourceL = left;
        processor.sourceR = right;
        processor.sourceLength = Math.min(left.length, right.length);
      },
      setParam(message) {
        const params = message.params || message;
        if (!params || typeof params !== "object") return;
        const nextParams = {
          ...params
        };
        if (typeof nextParams.masterGainDb === "number" && Number.isFinite(nextParams.masterGainDb)) {
          nextParams.masterGain = flush(dbToLinear2(nextParams.masterGainDb));
        } else if (typeof nextParams.masterGain === "number" && Number.isFinite(nextParams.masterGain)) {
          nextParams.masterGain = flush(nextParams.masterGain);
        } else if (typeof nextParams.db === "number" && Number.isFinite(nextParams.db)) {
          nextParams.masterGain = flush(dbToLinear2(nextParams.db));
        }
        if (typeof nextParams.filterCoeff === "number" && Number.isFinite(nextParams.filterCoeff)) {
          nextParams.filterCoeff = flush(nextParams.filterCoeff);
        }
        if (typeof nextParams.masterGain === "number" && Number.isFinite(nextParams.masterGain)) {
          nextParams.masterGain = flush(asNumber(nextParams.masterGain, processor.params.masterGain, 0, 8));
        }
        updateSchedulerParams(processor.scheduler, nextParams);
        if (typeof nextParams.filterCoeff === "number" && Number.isFinite(nextParams.filterCoeff)) {
          processor.params.filterCoeff = nextParams.filterCoeff;
        }
        if (typeof nextParams.masterGain === "number" && Number.isFinite(nextParams.masterGain)) {
          processor.params.masterGain = nextParams.masterGain;
        }
        if (typeof params.densityNorm === "boolean") {
          processor.params.densityNorm = asBoolean(params.densityNorm, processor.params.densityNorm);
        }
        if (typeof params.filterSpread === "number" && Number.isFinite(params.filterSpread)) {
          processor.params.filterSpread = asNumber(params.filterSpread, processor.params.filterSpread, 0, CUTOFF_SPREAD_OCTAVES_MAX);
        }
        if (typeof params.pitchJitter === "number" && Number.isFinite(params.pitchJitter)) {
          processor.params.pitchJitter = asNumber(params.pitchJitter, processor.params.pitchJitter, 0, 1);
        }
        if (typeof params.jitter === "number" && Number.isFinite(params.jitter)) {
          processor.params.scheduleJitter = asNumber(params.jitter, processor.params.scheduleJitter, 0, 1);
        }
        if (typeof params.window === "string") {
          const window2 = normalizeWindow(params.window);
          if (window2) processor.params.window = window2;
        }
        if (typeof params.pan === "number" && Number.isFinite(params.pan)) {
          processor.params.pan = asNumber(params.pan, processor.params.pan, -1, 1);
        }
        if (typeof params.panSpread === "number" && Number.isFinite(params.panSpread)) {
          processor.params.panSpread = asNumber(params.panSpread, processor.params.panSpread, 0, 1);
        }
        if (typeof params.grainSizeMs === "number" && Number.isFinite(params.grainSizeMs)) {
          processor.params.grainSizeMs = asNumber(params.grainSizeMs, processor.params.grainSizeMs, 0.1, 200);
        }
        if (typeof params.grainRateHz === "number" && Number.isFinite(params.grainRateHz)) {
          processor.params.grainRateHz = asNumber(params.grainRateHz, processor.params.grainRateHz, 1e-3, 1024);
        }
        if (typeof params.spray === "number" && Number.isFinite(params.spray)) {
          processor.params.spray = asNumber(params.spray, processor.params.spray, 0, 1);
        }
        if (typeof params.pitch === "number" && Number.isFinite(params.pitch)) {
          if (typeof processor.setPitch === "function") {
            processor.setPitch(params.pitch);
          } else {
            processor.params.pitch = params.pitch;
          }
        }
        if (typeof params.position === "number" && Number.isFinite(params.position)) {
          processor.params.position = asNumber(params.position, processor.params.position, 0, 1);
        }
        if (typeof params.direction === "number" && Number.isFinite(params.direction)) {
          processor.params.direction = params.direction === 0 ? 0 : params.direction > 0 ? 1 : -1;
        }
        if (typeof params.freeze === "boolean") {
          processor.params.freeze = params.freeze;
        }
        const partialFilter = {};
        if (typeof params.filterCutoff === "number" && Number.isFinite(params.filterCutoff)) {
          partialFilter.cutoff = asNumber(params.filterCutoff, processor.svfBaseCutoff ?? 12e3, 1, processor.sampleRate * 0.5);
        }
        if (params.filterType === "lp" || params.filterType === "hp" || params.filterType === "bp" || params.filterType === "notch") {
          partialFilter.type = params.filterType;
        }
        if (typeof params.filterResonance === "number" && Number.isFinite(params.filterResonance)) {
          partialFilter.resonance = asNumber(params.filterResonance, processor.filterResonance ?? 0.8, 0.1, 15);
        }
        if (Object.keys(partialFilter).length > 0 && typeof processor.setFilter === "function") {
          processor.setFilter(partialFilter);
        }
        if (typeof params.width === "number" && Number.isFinite(params.width)) {
          processor.width = asNumber(params.width, processor.width, 0, 2);
        }
        if (typeof params.filterEnv === "object" && params.filterEnv !== null && typeof processor.setFilterEnvelope === "function") {
          processor.setFilterEnvelope(params.filterEnv);
        } else if (typeof params.filterEnvelope === "object" && params.filterEnvelope !== null && typeof processor.setFilterEnvelope === "function") {
          processor.setFilterEnvelope(params.filterEnvelope);
        }
        if (typeof params.filter === "object" && params.filter !== null && typeof processor.setFilter === "function") {
          processor.setFilter(params.filter);
        }
        if (typeof params.voice === "object" && params.voice !== null && typeof processor.setVoiceParams === "function") {
          processor.setVoiceParams(params.voice);
        } else if (typeof params.voice === "object" && params.voice !== null && typeof processor.setVoice === "function") {
          processor.setVoice(params.voice);
        }
        if (Array.isArray(params.lfo) && typeof processor.setLfo === "function") {
          processor.setLfo(params.lfo);
        }
        if (typeof params.modMatrix === "object" && params.modMatrix !== null && typeof processor.setModMatrix === "function") {
          processor.setModMatrix(params.modMatrix);
        }
        if (typeof params.fx === "object" && params.fx !== null && typeof processor.setFx === "function") {
          processor.setFx(params.fx);
        }
      },
      setAdsr(message) {
        const adsr = message.adsr || message;
        if (!adsr || typeof adsr !== "object") return;
        const next = {
          attack: asNumber(adsr.attack, processor.adsr.attack, 0, 60),
          decay: asNumber(adsr.decay, processor.adsr.decay, 0, 60),
          sustain: asNumber(adsr.sustain, processor.adsr.sustain, 0, 1),
          release: asNumber(adsr.release, processor.adsr.release, 0, 60)
        };
        processor.adsr = next;
        setAdsr(processor.voice, next, processor.sampleRate);
      },
      noteOn(message) {
        processor.voiceActive = true;
        processor.voiceVelocity = asNumber(message?.velocity, processor.voiceVelocity, 0, 1);
        if (typeof processor.onNoteOn === "function") {
          processor.onNoteOn();
        }
      },
      noteOff() {
        processor.voiceActive = false;
        if (typeof processor.onNoteOff === "function") {
          processor.onNoteOff();
        }
      },
      onMessage(message) {
        if (!message || typeof message !== "object") return;
        switch (message.type) {
          case "setSource":
            this.setSource(message);
            break;
          case "setParam":
            this.setParam(message);
            break;
          case "setAdsr":
            this.setAdsr(message);
            break;
          case "master-gain":
          case "masterGain":
            this.setParam({
              ...message,
              masterGainDb: message?.masterGainDb ?? message?.db ?? message?.gain ?? void 0
            });
            break;
          case "noteOn":
            this.noteOn(message);
            break;
          case "noteOff":
            this.noteOff(message);
            break;
          default:
            break;
        }
      }
    };
  }

  // src/worklets/pollen/index.js
  var DEFAULT_PARAMS = {
    grainRateHz: 12,
    grainSizeMs: 40,
    spray: 0,
    jitter: 0.35,
    pitch: 0,
    pitchJitter: 0.02,
    position: 0.5,
    pan: 0,
    panSpread: 0.08,
    window: "hann",
    direction: 1,
    freeze: false,
    densityNorm: true,
    scheduleJitter: 0.35,
    filterCutoff: 12e3,
    filterSpread: 0.5,
    masterGain: 1
  };
  var TELEMETRY_FLOATS_PER_GRAIN = 5;
  var TELEMETRY_MAX_GRAINS = 256;
  var TELEMETRY_INTERVAL_SECONDS = 0.033;
  function clamp6(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
  function clamp016(value) {
    return clamp6(value, 0, 1);
  }
  function clamp01Signed(value) {
    return clamp6(value, -1, 1);
  }
  function asPositiveInt(value, fallback = 1) {
    if (!Number.isFinite(value)) return fallback;
    const next = Math.round(value);
    return Number.isFinite(next) ? next : fallback;
  }
  function toSamples(seconds, sampleRate2) {
    if (!Number.isFinite(seconds) || seconds <= 0) return 1;
    const samples = Math.round(seconds * sampleRate2);
    return samples > 1 ? samples : 1;
  }
  function makeFilterEnvelopeState() {
    return {
      enabled: false,
      attack: 0.01,
      decay: 0.12,
      sustain: 0.8,
      release: 0.2,
      amount: 6,
      keyTrack: false,
      value: 0,
      state: "off",
      attackSamples: 1,
      decaySamples: 1,
      sustainLevel: 0.8,
      releaseSamples: 1,
      releaseStart: 0
    };
  }
  function setFilterEnvelopeSamples(state, sampleRate2) {
    state.attackSamples = toSamples(state.attack, sampleRate2);
    state.decaySamples = toSamples(state.decay, sampleRate2);
    state.releaseSamples = toSamples(state.release, sampleRate2);
  }
  function triggerFilterEnvelope(state) {
    if (!state.enabled) {
      state.value = 0;
      state.state = "off";
      return;
    }
    state.value = 0;
    state.state = "attack";
  }
  function releaseFilterEnvelope(state) {
    if (state.state === "off") return;
    state.releaseStart = state.value;
    state.state = "release";
  }
  function advanceFilterEnvelope(state) {
    switch (state.state) {
      case "attack": {
        if (state.attackSamples <= 1) {
          state.value = 1;
          state.state = "decay";
          return state.value;
        }
        state.value += 1 / state.attackSamples;
        if (state.value >= 1) {
          state.value = 1;
          state.state = "decay";
        }
        return state.value;
      }
      case "decay": {
        if (state.decaySamples <= 1) {
          state.value = state.sustainLevel;
          state.state = "sustain";
          return state.value;
        }
        const step = (1 - state.sustainLevel) / state.decaySamples;
        state.value -= step;
        if (state.value <= state.sustainLevel) {
          state.value = state.sustainLevel;
          state.state = "sustain";
        }
        return state.value;
      }
      case "sustain":
        return state.value;
      case "release": {
        if (state.releaseSamples <= 1) {
          state.value = 0;
          state.state = "off";
          return 0;
        }
        const step = state.releaseStart / state.releaseSamples;
        state.value -= step;
        if (state.value <= 0) {
          state.value = 0;
          state.state = "off";
        }
        return state.value;
      }
      default:
        return 0;
    }
  }
  function makeModState() {
    return {
      routes: [
        { enabled: false, source: "lfo1", destination: "position", depth: 0 },
        { enabled: false, source: "lfo1", destination: "position", depth: 0 },
        { enabled: false, source: "lfo1", destination: "position", depth: 0 },
        { enabled: false, source: "lfo1", destination: "position", depth: 0 },
        { enabled: false, source: "lfo1", destination: "position", depth: 0 },
        { enabled: false, source: "lfo1", destination: "position", depth: 0 },
        { enabled: false, source: "lfo1", destination: "position", depth: 0 },
        { enabled: false, source: "lfo1", destination: "position", depth: 0 }
      ]
    };
  }
  function makeVoiceParams() {
    return {
      glideSeconds: 0,
      unison: 1,
      unisonDetuneSemitones: 3,
      currentPitch: 0,
      targetPitch: 0,
      glideSamplesRemaining: 0
    };
  }
  var PollenEngine = class extends AudioWorkletProcessor {
    constructor(options) {
      super();
      const processorOptions = options?.processorOptions ?? {};
      this.sampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48e3;
      this.params = {
        ...DEFAULT_PARAMS,
        ...processorOptions.params
      };
      this.adsr = {
        attack: 1e-3,
        decay: 0.05,
        sustain: 1,
        release: 0.05
      };
      this.sourceL = new Float32Array(0);
      this.sourceR = new Float32Array(0);
      this.sourceLength = 0;
      this.lfo = createLfoState();
      this.svf = createSvfState();
      setSvfParams(this.svf, { enabled: false, sampleRate: this.sampleRate, type: "lp", cutoff: 1e3, resonance: 0.8 });
      this.svfBaseCutoff = this.params.filterCutoff;
      this.svfTargetCutoff = this.params.filterCutoff;
      this.svfCoeffCounter = 0;
      this.fx = createFxState();
      this.pool = createGrainPool(processorOptions.maxGrains || 256);
      this.scheduler = createScheduler(this.sampleRate, this.params);
      this.filterEnvelope = makeFilterEnvelopeState();
      setFilterEnvelopeSamples(this.filterEnvelope, this.sampleRate);
      this.filterEnvelope.sustainLevel = clamp6(this.filterEnvelope.sustain, 0, 1);
      this.voiceParams = makeVoiceParams();
      this.voiceParams.currentPitch = this.params.pitch;
      this.voiceParams.targetPitch = this.params.pitch;
      this.modMatrix = makeModState();
      this.width = 1;
      this.voice = createVoice();
      this.voiceActive = true;
      this.voiceVelocity = 1;
      this.currentFrame = 0;
      this.filterType = "lp";
      this.filterResonance = 0.8;
      this.renderScratch = {
        left: 0,
        right: 0,
        activeGrains: 0,
        density: 1
      };
      this.telemetryEnabled = processorOptions.telemetry !== false;
      this.telemetryFrames = 0;
      this.telemetryIntervalFrames = Math.max(128, Math.round(this.sampleRate * TELEMETRY_INTERVAL_SECONDS));
      this.telemetryBuffer = new Float32Array(TELEMETRY_MAX_GRAINS * TELEMETRY_FLOATS_PER_GRAIN);
      this.telemetryPayload = {
        type: "pollenTelemetry",
        count: 0,
        floatsPerGrain: TELEMETRY_FLOATS_PER_GRAIN,
        sourceCursor01: 0,
        activeGrains: 0,
        sourceLength: 0,
        frame: 0,
        grains: this.telemetryBuffer
      };
      this.router = createMsgRouter(this);
      this.port.onmessage = (ev) => {
        this.router.onMessage(ev && ev.data);
      };
      if (typeof processorOptions.seed === "number" && Number.isFinite(processorOptions.seed)) {
        this.scheduler.seed = processorOptions.seed >>> 0;
      }
      this.noteSeed = this.scheduler.seed;
      if (typeof processorOptions.masterGain === "number" && Number.isFinite(processorOptions.masterGain)) {
        this.params.masterGain = processorOptions.masterGain;
      }
      if (processorOptions.sourceL) {
        this.router.setSource({
          sourceL: processorOptions.sourceL,
          sourceR: processorOptions.sourceR
        });
      }
      setupVoiceAdsrDefaults(this.voice, this.sampleRate);
      setAdsr(this.voice, this.adsr, this.sampleRate);
    }
    _updateModulatedParams() {
      const modulation = lfoTick(this.lfo, this.sampleRate);
      const velocity = clamp016(this.voiceVelocity);
      const filterEnvelopeLevel = advanceFilterEnvelope(this.filterEnvelope);
      const filterEnvSigned = clamp01Signed(filterEnvelopeLevel * 2 - 1);
      const filterEnvAmount = this.filterEnvelope.enabled ? clamp6(this.filterEnvelope.amount, -36, 36) * filterEnvelopeLevel : 0;
      const base = {
        position: this.params.position,
        grainSizeMs: this.params.grainSizeMs,
        grainRateHz: this.params.grainRateHz,
        pitch: this.voiceParams.currentPitch,
        // The mod-matrix "filterCutoff" destination targets the voice SVF cutoff
        // (not the per-grain one-pole). Base is set by setFilter.
        filterCutoff: this.svfBaseCutoff,
        pan: this.params.pan,
        width: this.width
      };
      const matrixed = applyModMatrixToParams(base, this.modMatrix, {
        lfo: modulation,
        filterEnv: filterEnvSigned,
        velocity,
        modWheel: 0,
        aftertouch: 0
      });
      this.svfTargetCutoff = clamp6(matrixed.filterCutoff * Math.pow(2, filterEnvAmount / 12), 1, this.sampleRate * 0.5);
      this.scheduler.params.position = matrixed.position;
      this.scheduler.params.grainSizeMs = clamp6(matrixed.grainSizeMs, 0.1, 1e3);
      this.scheduler.params.grainRateHz = clamp6(matrixed.grainRateHz, 1e-3, 1024);
      this.scheduler.params.pitch = matrixed.pitch;
      this.scheduler.params.filterCutoff = this.params.filterCutoff;
      this.scheduler.params.pan = clamp6(matrixed.pan, -1, 1);
      this.scheduler.params.panSpread = clamp016(this.params.panSpread);
      this.scheduler.params.scheduleJitter = clamp016(this.params.scheduleJitter);
      this.scheduler.params.masterGain = this.params.masterGain;
      this.width = clamp6(matrixed.width, 0, 2);
    }
    _setPitchTarget(value, immediate) {
      const next = clamp6(value, -48, 48);
      this.voiceParams.targetPitch = next;
      if (immediate || this.voiceParams.glideSeconds <= 0) {
        this.voiceParams.currentPitch = next;
        this.voiceParams.glideSamplesRemaining = 0;
        return;
      }
      if (this.voiceParams.glideSamplesRemaining <= 0) {
        this.voiceParams.glideSamplesRemaining = Math.max(1, Math.round(this.voiceParams.glideSeconds * this.sampleRate));
      }
    }
    _stepPitch() {
      if (this.voiceParams.glideSamplesRemaining <= 0) {
        this.voiceParams.currentPitch = this.voiceParams.targetPitch;
        return;
      }
      const remaining = this.voiceParams.glideSamplesRemaining;
      const step = (this.voiceParams.targetPitch - this.voiceParams.currentPitch) / remaining;
      this.voiceParams.currentPitch += step;
      this.voiceParams.glideSamplesRemaining -= 1;
      if (this.voiceParams.glideSamplesRemaining <= 0 || !Number.isFinite(step)) {
        this.voiceParams.currentPitch = this.voiceParams.targetPitch;
        this.voiceParams.glideSamplesRemaining = 0;
      }
    }
    setPitch(value) {
      this._setPitchTarget(value);
    }
    _setFilterEnvelopeFromPayload(payload) {
      this.filterEnvelope.enabled = payload?.enabled === true;
      if (typeof payload?.attack === "number" && Number.isFinite(payload.attack)) {
        this.filterEnvelope.attack = clamp6(payload.attack, 1e-3, 60);
      }
      if (typeof payload?.decay === "number" && Number.isFinite(payload.decay)) {
        this.filterEnvelope.decay = clamp6(payload.decay, 1e-3, 60);
      }
      if (typeof payload?.sustain === "number" && Number.isFinite(payload.sustain)) {
        this.filterEnvelope.sustain = clamp016(payload.sustain);
        this.filterEnvelope.sustainLevel = this.filterEnvelope.sustain;
      }
      if (typeof payload?.release === "number" && Number.isFinite(payload.release)) {
        this.filterEnvelope.release = clamp6(payload.release, 1e-3, 60);
      }
      if (typeof payload?.amount === "number" && Number.isFinite(payload.amount)) {
        this.filterEnvelope.amount = clamp6(payload.amount, -36, 36);
      }
      if (typeof payload?.keyTrack === "boolean") {
        this.filterEnvelope.keyTrack = payload.keyTrack;
      }
      setFilterEnvelopeSamples(this.filterEnvelope, this.sampleRate);
      if (this.filterEnvelope.state === "off" && !this.voiceActive) {
        this.filterEnvelope.value = 0;
      }
    }
    setFilter(payload) {
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "lp" || payload.type === "hp" || payload.type === "bp" || payload.type === "notch") {
        this.filterType = payload.type;
        setSvfParams(this.svf, { type: payload.type, enabled: true, sampleRate: this.sampleRate });
      }
      if (typeof payload.resonance === "number" && Number.isFinite(payload.resonance)) {
        this.filterResonance = clamp6(payload.resonance, 0.1, 15);
        setSvfParams(this.svf, {
          resonance: this.filterResonance,
          enabled: true,
          sampleRate: this.sampleRate
        });
      }
      if (typeof payload.cutoff === "number" && Number.isFinite(payload.cutoff)) {
        const cutoff = clamp6(payload.cutoff, 1, this.sampleRate * 0.5);
        this.svfBaseCutoff = cutoff;
        this.svfTargetCutoff = cutoff;
        setSvfParams(this.svf, {
          cutoff,
          enabled: true,
          sampleRate: this.sampleRate
        });
      }
    }
    setVoiceParams(params) {
      if (!params || typeof params !== "object") return;
      if (typeof params.glideSeconds === "number" && Number.isFinite(params.glideSeconds)) {
        this.voiceParams.glideSeconds = clamp6(params.glideSeconds, 0, 3);
      }
      if (typeof params.unison === "number" && Number.isFinite(params.unison)) {
        this.voiceParams.unison = asPositiveInt(clamp6(params.unison, 1, 8), this.voiceParams.unison);
      }
      if (typeof params.unisonDetuneSemitones === "number" && Number.isFinite(params.unisonDetuneSemitones)) {
        this.voiceParams.unisonDetuneSemitones = clamp6(params.unisonDetuneSemitones, 0, 12);
      }
      if (this.voiceParams.glideSamplesRemaining > 0 && this.voiceParams.glideSeconds > 0) {
        this.voiceParams.glideSamplesRemaining = Math.max(1, Math.round(this.voiceParams.glideSeconds * this.sampleRate));
      }
    }
    setLfo(params) {
      if (!Array.isArray(params)) return;
      for (let i = 0; i < params.length && i < this.lfo.length; i++) {
        const input = params[i];
        if (!input || typeof input !== "object") continue;
        if (typeof input.enabled === "boolean") {
          this.lfo[i].enabled = input.enabled;
        }
        if (typeof input.shape === "string") {
          this.lfo[i].shape = input.shape;
        }
        if (typeof input.rateHz === "number" && Number.isFinite(input.rateHz)) {
          this.lfo[i].rateHz = clamp6(input.rateHz, 0.01, 20);
        }
        if (typeof input.amount === "number" && Number.isFinite(input.amount)) {
          this.lfo[i].amount = clamp6(input.amount, -1, 1);
        }
        if (typeof input.sync === "boolean") {
          this.lfo[i].sync = input.sync;
        }
        if (typeof input.syncNumerator === "number" && Number.isFinite(input.syncNumerator)) {
          this.lfo[i].syncNumerator = Math.max(1, Math.round(input.syncNumerator));
        }
        if (typeof input.syncDenominator === "number" && Number.isFinite(input.syncDenominator)) {
          this.lfo[i].syncDenominator = Math.max(1, Math.round(input.syncDenominator));
        }
      }
    }
    setModMatrix(matrix) {
      if (!matrix || typeof matrix !== "object") return;
      const normalized = matrix && typeof matrix.routes !== "undefined" ? matrix : { routes: matrix };
      this.modMatrix = this._normalizeModMatrix(normalized);
    }
    setFx(params) {
      if (params && typeof params === "object") {
        setFxParams(this.fx, params);
      }
    }
    _normalizeModMatrix(matrix) {
      const out = {
        routes: []
      };
      const routes = Array.isArray(matrix?.routes) ? matrix.routes : [];
      const limit = Math.min(routes.length, 8);
      for (let i = 0; i < limit; i++) {
        const route = routes[i];
        if (!route || typeof route !== "object") continue;
        out.routes.push({
          enabled: route.enabled === true,
          source: typeof route.source === "string" ? route.source : "lfo1",
          destination: typeof route.destination === "string" ? route.destination : "position",
          depth: clamp6(route.depth, -1, 1)
        });
      }
      while (out.routes.length < 8) {
        out.routes.push({
          enabled: false,
          source: "lfo1",
          destination: "position",
          depth: 0
        });
      }
      return out;
    }
    onNoteOn() {
      this.voiceActive = true;
      const scheduler = this.scheduler;
      scheduler.nextInterval = 0;
      scheduler.seed = this.noteSeed;
      const startCursor = scheduler.params.freeze ? scheduler.frozenSourceCursor : 0;
      scheduler.sourceCursor = startCursor;
      scheduler.frozenSourceCursor = startCursor;
      resetGrainPool(this.pool);
      this.pool.nextSlot = 0;
      for (const ic of this.svf.chan) {
        ic.ic1eq = 0;
        ic.ic2eq = 0;
      }
      this.svfCoeffCounter = 0;
      voiceNoteOn(this.voice);
      triggerFilterEnvelope(this.filterEnvelope);
    }
    onNoteOff() {
      this.voiceActive = false;
      voiceNoteOff(this.voice);
      releaseFilterEnvelope(this.filterEnvelope);
    }
    setSource(sourceL, sourceR) {
      this.router.setSource({
        sourceL,
        sourceR: sourceR || sourceL
      });
    }
    setParam(params) {
      this.router.setParam({ type: "setParam", ...params });
    }
    setAdsr(params) {
      this.router.setAdsr({ type: "setAdsr", ...params });
    }
    _postTelemetry(sourceLen) {
      if (!this.telemetryEnabled || sourceLen <= 0) return;
      const payload = this.telemetryPayload;
      const buf = this.telemetryBuffer;
      let count = 0;
      for (let i = 0; i < this.pool.max && count < TELEMETRY_MAX_GRAINS; i++) {
        const g = this.pool.grains[i];
        if (!g || g.durationSamples <= 0 || g.age >= g.durationSamples) continue;
        const base = count * TELEMETRY_FLOATS_PER_GRAIN;
        const duration = Math.max(1, g.durationSamples);
        const age01 = clamp016(g.age / duration);
        buf[base] = clamp016(g.phase / sourceLen);
        buf[base + 1] = age01;
        buf[base + 2] = Number.isFinite(g.gain) ? g.gain : 0;
        buf[base + 3] = clamp6(g.pan, -1, 1);
        buf[base + 4] = Number.isFinite(g.playbackRate) ? g.playbackRate : 1;
        count += 1;
      }
      payload.count = count;
      payload.sourceCursor01 = clamp016(this.scheduler.sourceCursor / sourceLen);
      payload.activeGrains = this.renderScratch.activeGrains | 0;
      payload.sourceLength = sourceLen;
      payload.frame = this.currentFrame;
      this.port.postMessage(payload);
    }
    _spawnFromTick(grainParams) {
      if (!grainParams) return;
      const detune = clamp6(this.voiceParams.unisonDetuneSemitones, 0, 12);
      const unison = Math.max(1, asPositiveInt(this.voiceParams.unison, 1));
      if (unison <= 1 || detune <= 0) {
        spawnGrain(this.pool, this.sampleRate, {
          ...grainParams,
          gain: grainParams.gain
        });
        return;
      }
      const scale = 1 / Math.sqrt(unison);
      const half = unison - 1;
      const maxDetune = detune * 0.5;
      for (let i = 0; i < unison; i++) {
        const span = half === 0 ? 0 : (i / half * 2 - 1) * maxDetune;
        const rate = grainParams.playbackRate * Math.pow(2, span / 12);
        spawnGrain(this.pool, this.sampleRate, {
          ...grainParams,
          playbackRate: rate,
          gain: grainParams.gain * scale
        });
      }
    }
    process(_inputs, outputs) {
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const left = output[0];
      const right = output[1] ?? left;
      left.fill(0);
      if (right && right !== left) right.fill(0);
      const sourceLen = Math.max(0, this.sourceLength | 0);
      if (sourceLen === 0 || !left.length) return true;
      const densityNorm = this.params.densityNorm !== false;
      for (let frame = 0; frame < left.length; frame += 1) {
        this._stepPitch();
        this._updateModulatedParams();
        const envelope = voiceAdvance(this.voice);
        if (this.voice.state !== "off") {
          scheduleTick(this.scheduler, sourceLen, (grainParams) => this._spawnFromTick(grainParams));
        }
        const rendered = renderGrainBlock(
          this.pool,
          this.sourceL,
          this.sourceR,
          this.sampleRate,
          densityNorm,
          this.renderScratch
        );
        const gain = this.params.masterGain * this.voiceVelocity * envelope;
        let l = rendered.left * gain;
        let r = rendered.right * gain;
        if (this.svfCoeffCounter <= 0) {
          setSvfCutoff(this.svf, this.svfTargetCutoff);
          commitSvfCoeffs(this.svf);
          this.svfCoeffCounter = 16;
        }
        this.svfCoeffCounter -= 1;
        l = applySvf(l, this.svf, 0);
        r = applySvf(r, this.svf, 1);
        const effected = applyFx(l, r, this.fx);
        l = effected.l;
        r = effected.r;
        if (!Number.isFinite(l)) l = 0;
        if (!Number.isFinite(r)) r = 0;
        left[frame] = l;
        if (right && right !== left) right[frame] = r;
        advanceSourceCursor(this.scheduler, sourceLen, 1);
        this.currentFrame += 1;
      }
      this.telemetryFrames += left.length;
      if (this.telemetryFrames >= this.telemetryIntervalFrames) {
        this.telemetryFrames = 0;
        this._postTelemetry(sourceLen);
      }
      return true;
    }
  };
  registerProcessor("pollen-engine", PollenEngine);
})();
