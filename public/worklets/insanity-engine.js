// GENERATED FILE — DO NOT EDIT.
// Source: src/worklets/insanity/  •  Rebuild: npm run build:worklet

"use strict";
(() => {
  // src/lib/insanity/params.ts
  var OSC_COUNT = 8;
  var BANK_BANDS = 32;
  var LFO_COUNT = 16;
  var ENV_COUNT = 16;
  var FUNC_COUNT = 16;
  var MACRO_COUNT = 64;
  var XY_COUNT = 16;
  var MOD_SLOTS = 64;
  var MAX_VOICES = 16;
  var OSC_MODES = [
    "off",
    "sine",
    "tri",
    "saw",
    "square",
    "noise",
    "wavetable",
    "fm",
    "additive",
    "chaos"
  ];
  var FILTER_TYPES = ["lp", "hp", "bp", "notch"];
  var BANK_TYPES = ["peak", "lp", "hp", "bp", "notch"];
  var LFO_SHAPES = ["sine", "tri", "saw", "square", "random"];
  var FUNC_MODES = ["random", "sampleHold", "drift", "step"];
  var VOICE_FILTER_ROUTING = ["serial", "parallel"];
  var LAYER_IDS = ["braids", "breezaphone", "pollen", "exciton"];
  var list = [];
  function cont(id, label, group, min, max, def, opts = {}) {
    const target = opts.target ?? "engine";
    list.push({
      id,
      label,
      group,
      kind: "cont",
      min,
      max,
      def,
      skew: opts.skew ?? "lin",
      unit: opts.unit,
      target,
      modulatable: opts.modulatable ?? target === "engine"
    });
  }
  function int(id, label, group, min, max, def, target = "engine") {
    list.push({ id, label, group, kind: "int", min, max, def, skew: "lin", target, modulatable: false });
  }
  function en(id, label, group, options, def, target = "engine") {
    list.push({ id, label, group, kind: "enum", min: 0, max: options.length - 1, def, skew: "lin", options, target, modulatable: false });
  }
  function bool(id, label, group, def, target = "engine") {
    list.push({ id, label, group, kind: "bool", min: 0, max: 1, def: def ? 1 : 0, skew: "lin", target, modulatable: false });
  }
  for (let i = 1; i <= OSC_COUNT; i++) {
    const p = `osc${i}`;
    en(`${p}.mode`, `OSC ${i} Mode`, "osc", OSC_MODES, i === 1 ? 3 : i === 2 ? 4 : 0);
    cont(`${p}.level`, `OSC ${i} Level`, "osc", 0, 1, i <= 2 ? 0.6 : 0.5);
    cont(`${p}.coarse`, `OSC ${i} Coarse`, "osc", -24, 24, i === 2 ? -12 : 0, { unit: "st" });
    cont(`${p}.fine`, `OSC ${i} Fine`, "osc", -100, 100, i === 2 ? 7 : 0, { unit: "ct" });
    cont(`${p}.pan`, `OSC ${i} Pan`, "osc", -1, 1, 0);
    cont(`${p}.shape`, `OSC ${i} Shape`, "osc", 0, 1, 0.5);
    cont(`${p}.ratio`, `OSC ${i} Ratio`, "osc", 0.25, 16, 2, { skew: "log" });
    int(`${p}.unison`, `OSC ${i} Unison`, "osc", 1, 8, 1);
    cont(`${p}.detune`, `OSC ${i} Detune`, "osc", 0, 1, 0.2);
  }
  cont("amp.attack", "Amp Attack", "voice", 1e-3, 10, 5e-3, { skew: "log", unit: "s" });
  cont("amp.decay", "Amp Decay", "voice", 1e-3, 10, 0.3, { skew: "log", unit: "s" });
  cont("amp.sustain", "Amp Sustain", "voice", 0, 1, 0.8);
  cont("amp.release", "Amp Release", "voice", 1e-3, 15, 0.35, { skew: "log", unit: "s" });
  cont("fenv.attack", "Filter Env Attack", "voice", 1e-3, 10, 5e-3, { skew: "log", unit: "s" });
  cont("fenv.decay", "Filter Env Decay", "voice", 1e-3, 10, 0.4, { skew: "log", unit: "s" });
  cont("fenv.sustain", "Filter Env Sustain", "voice", 0, 1, 0.3);
  cont("fenv.release", "Filter Env Release", "voice", 1e-3, 15, 0.4, { skew: "log", unit: "s" });
  for (let f = 1; f <= 2; f++) {
    const p = `vf${f}`;
    en(`${p}.type`, `Filter ${f} Type`, "voice", FILTER_TYPES, f === 1 ? 0 : 1);
    cont(`${p}.cutoff`, `Filter ${f} Cutoff`, "voice", 20, 2e4, f === 1 ? 2400 : 20, { skew: "log", unit: "Hz" });
    cont(`${p}.reso`, `Filter ${f} Reso`, "voice", 0, 1, f === 1 ? 0.25 : 0);
    cont(`${p}.drive`, `Filter ${f} Drive`, "voice", 0, 1, 0);
    cont(`${p}.envAmt`, `Filter ${f} Env Amt`, "voice", -1, 1, f === 1 ? 0.35 : 0);
    cont(`${p}.keytrack`, `Filter ${f} Keytrack`, "voice", 0, 1, 0.3);
  }
  en("vf.routing", "Filter Routing", "voice", VOICE_FILTER_ROUTING, 0);
  cont("voice.glide", "Glide", "voice", 0, 2, 0, { unit: "s" });
  int("voice.polyphony", "Polyphony", "voice", 1, MAX_VOICES, 12);
  cont("voice.bendRange", "Bend Range", "voice", 0, 24, 2, { unit: "st", modulatable: false });
  var BANK_DEFAULT_FREQS = (i) => 30 * Math.pow(18e3 / 30, (i - 1) / (BANK_BANDS - 1));
  for (let i = 1; i <= BANK_BANDS; i++) {
    const p = `bank${i}`;
    bool(`${p}.on`, `FLT ${i} On`, "bank", false);
    en(`${p}.type`, `FLT ${i} Type`, "bank", BANK_TYPES, 0);
    cont(`${p}.freq`, `FLT ${i} Freq`, "bank", 20, 2e4, Math.round(BANK_DEFAULT_FREQS(i)), { skew: "log", unit: "Hz" });
    cont(`${p}.q`, `FLT ${i} Q`, "bank", 0.1, 18, 1, { skew: "log" });
    cont(`${p}.gain`, `FLT ${i} Gain`, "bank", -18, 18, 0, { unit: "dB" });
    bool(`${p}.parallel`, `FLT ${i} Parallel`, "bank", false);
  }
  cont("bank.mix", "Filter Bank Mix", "bank", 0, 1, 1);
  cont("fx.drive.db", "Drive", "fx", 0, 24, 0, { unit: "dB" });
  cont("fx.drive.mix", "Drive Mix", "fx", 0, 1, 0);
  int("fx.crush.bits", "Crush Bits", "fx", 2, 16, 16);
  cont("fx.crush.rate", "Crush Downsample", "fx", 1, 32, 1, { skew: "log" });
  cont("fx.crush.mix", "Crush Mix", "fx", 0, 1, 0);
  cont("fx.chorus.rate", "Chorus Rate", "fx", 0.05, 6, 0.4, { skew: "log", unit: "Hz" });
  cont("fx.chorus.depth", "Chorus Depth", "fx", 0, 1, 0.3);
  cont("fx.chorus.mix", "Chorus Mix", "fx", 0, 1, 0);
  cont("fx.phaser.rate", "Phaser Rate", "fx", 0.05, 8, 0.3, { skew: "log", unit: "Hz" });
  cont("fx.phaser.depth", "Phaser Depth", "fx", 0, 1, 0.6);
  cont("fx.phaser.mix", "Phaser Mix", "fx", 0, 1, 0);
  cont("fx.delay.time", "Delay Time", "fx", 15, 1200, 375, { skew: "log", unit: "ms" });
  cont("fx.delay.feedback", "Delay Feedback", "fx", 0, 0.95, 0.35);
  cont("fx.delay.damping", "Delay Damping", "fx", 0, 1, 0.4);
  cont("fx.delay.mix", "Delay Mix", "fx", 0, 1, 0.15);
  cont("fx.reverb.size", "Reverb Size", "fx", 0, 1, 0.6);
  cont("fx.reverb.damping", "Reverb Damping", "fx", 0, 1, 0.5);
  cont("fx.reverb.mix", "Reverb Mix", "fx", 0, 1, 0.2);
  cont("fx.ring.freq", "Ring Mod Freq", "fx", 1, 4e3, 220, { skew: "log", unit: "Hz" });
  cont("fx.ring.mix", "Ring Mod Mix", "fx", 0, 1, 0);
  cont("fx.width", "Stereo Width", "fx", 0, 2, 1);
  for (let i = 1; i <= LFO_COUNT; i++) {
    en(`lfo${i}.shape`, `LFO ${i} Shape`, "lfo", LFO_SHAPES, (i - 1) % LFO_SHAPES.length);
    cont(`lfo${i}.rate`, `LFO ${i} Rate`, "lfo", 0.01, 30, 0.5 + i * 0.37, { skew: "log", unit: "Hz" });
    cont(`lfo${i}.amount`, `LFO ${i} Amount`, "lfo", 0, 1, 1);
  }
  for (let i = 1; i <= ENV_COUNT; i++) {
    cont(`env${i}.attack`, `ENV ${i} Attack`, "env", 1e-3, 10, 0.01 * i, { skew: "log", unit: "s" });
    cont(`env${i}.decay`, `ENV ${i} Decay`, "env", 1e-3, 10, 0.3, { skew: "log", unit: "s" });
    cont(`env${i}.sustain`, `ENV ${i} Sustain`, "env", 0, 1, 0.5);
    cont(`env${i}.release`, `ENV ${i} Release`, "env", 1e-3, 15, 0.5, { skew: "log", unit: "s" });
  }
  for (let i = 1; i <= FUNC_COUNT; i++) {
    en(`func${i}.mode`, `FUNC ${i} Mode`, "func", FUNC_MODES, (i - 1) % FUNC_MODES.length);
    cont(`func${i}.rate`, `FUNC ${i} Rate`, "func", 0.05, 40, 2, { skew: "log", unit: "Hz" });
    cont(`func${i}.smooth`, `FUNC ${i} Smooth`, "func", 0, 1, 0.3);
  }
  for (let i = 1; i <= MACRO_COUNT; i++) {
    cont(`macro${i}`, `Macro ${i}`, "macro", 0, 1, 0, { modulatable: false });
  }
  for (let i = 1; i <= XY_COUNT; i++) {
    cont(`xy${i}.x`, `XY ${i} X`, "xy", 0, 1, 0.5, { modulatable: false });
    cont(`xy${i}.y`, `XY ${i} Y`, "xy", 0, 1, 0.5, { modulatable: false });
  }
  cont("chaos.mu", "Chaos Mu", "chaos", 0.01, 8, 1.2, { skew: "log" });
  cont("chaos.rate", "Chaos Rate", "chaos", 0.05, 40, 1.5, { skew: "log", unit: "Hz" });
  cont("chaos.drive", "Chaos Drive", "chaos", 0, 1, 0.3);
  cont("chaos.amount", "Chaos Amount", "chaos", 0, 1, 1);
  cont("master.eqLow", "EQ Low", "master", -15, 15, 0, { unit: "dB" });
  cont("master.eqMid", "EQ Mid", "master", -15, 15, 0, { unit: "dB" });
  cont("master.eqMidFreq", "EQ Mid Freq", "master", 200, 8e3, 1200, { skew: "log", unit: "Hz" });
  cont("master.eqHigh", "EQ High", "master", -15, 15, 0, { unit: "dB" });
  cont("master.compThresh", "Comp Threshold", "master", -48, 0, -12, { unit: "dB" });
  cont("master.compRatio", "Comp Ratio", "master", 1, 20, 3, { skew: "log" });
  cont("master.compAttack", "Comp Attack", "master", 0.1, 100, 10, { skew: "log", unit: "ms" });
  cont("master.compRelease", "Comp Release", "master", 10, 1e3, 120, { skew: "log", unit: "ms" });
  cont("master.ceiling", "Limiter Ceiling", "master", -12, 0, -0.3, { unit: "dB" });
  cont("master.clipper", "Clipper", "master", 0, 1, 0);
  cont("master.volume", "Output", "master", -60, 6, 0, { unit: "dB" });
  bool("global.destroyCpu", "DESTROY CPU", "global", false);
  cont("global.tempo", "Tempo", "global", 40, 240, 120, { unit: "BPM", modulatable: false });
  for (const l of LAYER_IDS) {
    bool(`layer.${l}.on`, `${l} On`, "layer", false, "layer");
    cont(`layer.${l}.level`, `${l} Level`, "layer", 0, 1, 0.6, { target: "layer" });
    cont(`layer.${l}.a`, `${l} A`, "layer", 0, 1, 0.5, { target: "layer" });
    cont(`layer.${l}.b`, `${l} B`, "layer", 0, 1, 0.5, { target: "layer" });
    cont(`layer.${l}.c`, `${l} C`, "layer", 0, 1, 0.5, { target: "layer" });
    cont(`layer.${l}.d`, `${l} D`, "layer", 0, 1, 0.5, { target: "layer" });
  }
  var MOD_SOURCES = (() => {
    const s = ["none"];
    for (let i = 1; i <= LFO_COUNT; i++) s.push(`lfo${i}`);
    for (let i = 1; i <= ENV_COUNT; i++) s.push(`env${i}`);
    for (let i = 1; i <= FUNC_COUNT; i++) s.push(`func${i}`);
    for (let i = 1; i <= MACRO_COUNT; i++) s.push(`macro${i}`);
    for (let i = 1; i <= XY_COUNT; i++) {
      s.push(`xy${i}.x`);
      s.push(`xy${i}.y`);
    }
    s.push("velocity", "modwheel", "aftertouch", "keytrack", "chaos", "noteRandom", "ampEnv", "filterEnv");
    return s;
  })();
  var MOD_DESTS = list.map((p, i) => p.modulatable ? i : -1).filter((i) => i >= 0);
  for (let i = 1; i <= MOD_SLOTS; i++) {
    int(`mod${i}.src`, `Mod ${i} Source`, "mod", 0, MOD_SOURCES.length - 1, 0);
    int(`mod${i}.dst`, `Mod ${i} Dest`, "mod", 0, MOD_DESTS.length - 1, 0);
    cont(`mod${i}.amount`, `Mod ${i} Amount`, "mod", -1, 1, 0, { modulatable: false });
  }
  var PARAMS = list;
  var PARAM_COUNT = PARAMS.length;
  var indexById = /* @__PURE__ */ new Map();
  PARAMS.forEach((p, i) => indexById.set(p.id, i));
  function paramIndex(id) {
    const i = indexById.get(id);
    if (i === void 0) throw new Error(`insanity: unknown param "${id}"`);
    return i;
  }
  function toNorm(p, value) {
    if (p.max === p.min) return 0;
    if (p.skew === "log" && p.min > 0) {
      const n2 = Math.log(value / p.min) / Math.log(p.max / p.min);
      return n2 < 0 ? 0 : n2 > 1 ? 1 : n2;
    }
    const n = (value - p.min) / (p.max - p.min);
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }
  function fromNorm(p, norm) {
    const n = norm < 0 ? 0 : norm > 1 ? 1 : norm;
    let v = p.skew === "log" && p.min > 0 ? p.min * Math.pow(p.max / p.min, n) : p.min + n * (p.max - p.min);
    if (p.kind !== "cont") v = Math.round(v);
    return v;
  }
  function clampParam(p, value) {
    if (!Number.isFinite(value)) return p.def;
    let v = value < p.min ? p.min : value > p.max ? p.max : value;
    if (p.kind !== "cont") v = Math.round(v);
    return v;
  }

  // src/lib/insanity/protocol.ts
  var INSANITY_PROCESSOR_NAME = "insanity-engine";

  // src/worklets/insanity/pidx.js
  var d = (a, b) => paramIndex(b) - paramIndex(a);
  var P = {
    // oscillators: osc{i}.mode/level/coarse/fine/pan/shape/ratio/unison/detune
    osc: paramIndex("osc1.mode"),
    oscStride: d("osc1.mode", "osc2.mode"),
    oMode: 0,
    oLevel: d("osc1.mode", "osc1.level"),
    oCoarse: d("osc1.mode", "osc1.coarse"),
    oFine: d("osc1.mode", "osc1.fine"),
    oPan: d("osc1.mode", "osc1.pan"),
    oShape: d("osc1.mode", "osc1.shape"),
    oRatio: d("osc1.mode", "osc1.ratio"),
    oUnison: d("osc1.mode", "osc1.unison"),
    oDetune: d("osc1.mode", "osc1.detune"),
    ampA: paramIndex("amp.attack"),
    ampD: paramIndex("amp.decay"),
    ampS: paramIndex("amp.sustain"),
    ampR: paramIndex("amp.release"),
    fenvA: paramIndex("fenv.attack"),
    fenvD: paramIndex("fenv.decay"),
    fenvS: paramIndex("fenv.sustain"),
    fenvR: paramIndex("fenv.release"),
    vf1: paramIndex("vf1.type"),
    vfStride: d("vf1.type", "vf2.type"),
    fType: 0,
    fCutoff: d("vf1.type", "vf1.cutoff"),
    fReso: d("vf1.type", "vf1.reso"),
    fDrive: d("vf1.type", "vf1.drive"),
    fEnvAmt: d("vf1.type", "vf1.envAmt"),
    fKeytrack: d("vf1.type", "vf1.keytrack"),
    vfRouting: paramIndex("vf.routing"),
    glide: paramIndex("voice.glide"),
    polyphony: paramIndex("voice.polyphony"),
    bendRange: paramIndex("voice.bendRange"),
    lfo: paramIndex("lfo1.shape"),
    lfoStride: d("lfo1.shape", "lfo2.shape"),
    lShape: 0,
    lRate: d("lfo1.shape", "lfo1.rate"),
    lAmount: d("lfo1.shape", "lfo1.amount"),
    env: paramIndex("env1.attack"),
    envStride: d("env1.attack", "env2.attack"),
    eA: 0,
    eD: d("env1.attack", "env1.decay"),
    eS: d("env1.attack", "env1.sustain"),
    eR: d("env1.attack", "env1.release"),
    func: paramIndex("func1.mode"),
    funcStride: d("func1.mode", "func2.mode"),
    fnMode: 0,
    fnRate: d("func1.mode", "func1.rate"),
    fnSmooth: d("func1.mode", "func1.smooth"),
    macro: paramIndex("macro1"),
    xy: paramIndex("xy1.x"),
    chaosMu: paramIndex("chaos.mu"),
    chaosRate: paramIndex("chaos.rate"),
    chaosDrive: paramIndex("chaos.drive"),
    chaosAmount: paramIndex("chaos.amount"),
    destroyCpu: paramIndex("global.destroyCpu"),
    mod: paramIndex("mod1.src"),
    modStride: d("mod1.src", "mod2.src"),
    mSrc: 0,
    mDst: d("mod1.src", "mod1.dst"),
    mAmt: d("mod1.src", "mod1.amount")
  };
  var VOICE_PARAM_END = (() => {
    let i = 0;
    while (i < PARAMS.length && (PARAMS[i].group === "osc" || PARAMS[i].group === "voice")) i++;
    return i;
  })();

  // src/worklets/insanity/chaos.js
  var VDP_MU_MAX = 5.64;
  var TWO_PI = 2 * Math.PI;
  var TABLE_POINTS = 33;
  var MEASURE_DTAU = 0.01;
  function accel(x, v, mu, f) {
    return mu * (1 - x * x) * v - x + f;
  }
  var out2 = new Float64Array(2);
  function vdpRk4(x, v, mu, h, f) {
    const h2 = 0.5 * h;
    const k1x = v, k1v = accel(x, v, mu, f);
    const k2x = v + h2 * k1v, k2v = accel(x + h2 * k1x, v + h2 * k1v, mu, f);
    const k3x = v + h2 * k2v, k3v = accel(x + h2 * k2x, v + h2 * k2v, mu, f);
    const k4x = v + h * k3v, k4v = accel(x + h * k3x, v + h * k3v, mu, f);
    out2[0] = x + h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    out2[1] = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
    return out2;
  }
  function measurePeriodTau(mu) {
    let x = 2, v = 0;
    const warm = Math.ceil(60 / MEASURE_DTAU);
    for (let i = 0; i < warm; i++) {
      const r = vdpRk4(x, v, mu, MEASURE_DTAU, 0);
      x = r[0];
      v = r[1];
    }
    let first = -1, last = -1, count = 0, tau = 0, prev = x;
    const maxSteps = Math.ceil(TWO_PI * (4 + mu) * 8 / MEASURE_DTAU);
    for (let i = 0; i < maxSteps && count < 7; i++) {
      const r = vdpRk4(x, v, mu, MEASURE_DTAU, 0);
      x = r[0];
      v = r[1];
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
  var PERIOD_TABLE = (() => {
    const t = new Float64Array(TABLE_POINTS);
    for (let i = 0; i < TABLE_POINTS; i++) {
      const mu = VDP_MU_MAX * i / (TABLE_POINTS - 1);
      t[i] = measurePeriodTau(mu) / TWO_PI;
    }
    return t;
  })();
  function vdpPeriodRatio(mu) {
    const m = mu < 0 ? 0 : mu > VDP_MU_MAX ? VDP_MU_MAX : mu;
    const pos = m / VDP_MU_MAX * (TABLE_POINTS - 1);
    const i = pos | 0;
    if (i >= TABLE_POINTS - 1) return PERIOD_TABLE[TABLE_POINTS - 1];
    const f = pos - i;
    return PERIOD_TABLE[i] * (1 - f) + PERIOD_TABLE[i + 1] * f;
  }
  function createChaosSource() {
    return { x: 0.5, v: 0, fphase: 0, value: 0 };
  }
  function tickChaosSource(cs, rate, mu, drive2, amount, dt) {
    const R = vdpPeriodRatio(mu);
    const deltaTau = TWO_PI * rate * R * dt;
    let os = Math.ceil(Math.max(1, deltaTau / 0.05, deltaTau * mu / 0.05));
    if (os > 64) os = 64;
    const h = deltaTau / os;
    cs.fphase += rate * 0.618034 * dt;
    cs.fphase -= Math.floor(cs.fphase);
    const f = drive2 * 2.5 * Math.sin(TWO_PI * cs.fphase);
    let x = cs.x, v = cs.v;
    for (let i = 0; i < os; i++) {
      const r = vdpRk4(x, v, mu, h, f);
      x = r[0];
      v = r[1];
    }
    if (!(Math.abs(x) < 6) || !(Math.abs(v) < 60)) {
      x = 0.5;
      v = 0;
    }
    cs.x = x;
    cs.v = v;
    let val = x * 0.5;
    val = val < -1 ? -1 : val > 1 ? 1 : val;
    cs.value = val * amount;
    return cs.value;
  }

  // src/worklets/insanity/modSources.js
  var at = (id) => {
    const i = MOD_SOURCES.indexOf(id);
    return i < 0 ? 0 : i;
  };
  var SRC_COUNT = MOD_SOURCES.length;
  var S_LFO = at("lfo1");
  var S_ENV = at("env1");
  var S_FUNC = at("func1");
  var S_MACRO = at("macro1");
  var S_XY = at("xy1.x");
  var S_VELOCITY = at("velocity");
  var S_MODWHEEL = at("modwheel");
  var S_AFTERTOUCH = at("aftertouch");
  var S_KEYTRACK = at("keytrack");
  var S_CHAOS = at("chaos");
  var S_NOTERANDOM = at("noteRandom");
  var S_AMPENV = at("ampEnv");
  var S_FILTERENV = at("filterEnv");
  var VOICE_SOURCE = (() => {
    const m = new Uint8Array(SRC_COUNT);
    for (let i = 0; i < ENV_COUNT; i++) m[S_ENV + i] = 1;
    m[S_VELOCITY] = m[S_KEYTRACK] = m[S_NOTERANDOM] = m[S_AMPENV] = m[S_FILTERENV] = 1;
    m[0] = 0;
    return m;
  })();
  var TWO_PI2 = 2 * Math.PI;
  var FUNC_STEPS = 8;
  var seed = 625341585;
  function reseed(s) {
    seed = s | 0 || 625341585;
  }
  function rand01() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }
  function createGlobalSources() {
    const fSeq = new Float32Array(FUNC_COUNT * FUNC_STEPS);
    for (let i = 0; i < fSeq.length; i++) fSeq[i] = rand01() * 2 - 1;
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
    for (let i = 0; i < LFO_COUNT; i++) lfoPh[i] = i / LFO_COUNT;
    return {
      lfoPh,
      lfoSh: new Float32Array(LFO_COUNT),
      lfoVal: new Float32Array(LFO_COUNT),
      fPh,
      fPrev,
      fTarget,
      fWalk,
      fStep,
      fSeq,
      fVal,
      chaos: createChaosSource(),
      chaosVal: 0,
      modwheel: 0,
      aftertouch: 0
    };
  }
  function tickGlobalSources(gs, g, src, dt) {
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
        case 1:
          v = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
          break;
        case 2:
          v = 2 * p - 1;
          break;
        case 3:
          v = p < 0.5 ? 1 : -1;
          break;
        case 4:
          v = gs.lfoSh[i];
          break;
        default:
          v = Math.sin(TWO_PI2 * p);
      }
      v *= amt;
      gs.lfoVal[i] = v;
      src[S_LFO + i] = v;
    }
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
        case 1:
          raw = gs.fTarget[i];
          break;
        // sample & hold
        case 2: {
          let w = gs.fWalk[i] + (rand01() * 2 - 1) * Math.sqrt(rate * dt) * 0.6 - gs.fWalk[i] * rate * dt * 0.15;
          w = w < -1 ? -1 : w > 1 ? 1 : w;
          gs.fWalk[i] = w;
          raw = w;
          break;
        }
        case 3:
          raw = gs.fSeq[i * FUNC_STEPS + gs.fStep[i]];
          break;
        // 8-step random sequence
        default:
          raw = gs.fPrev[i] + (gs.fTarget[i] - gs.fPrev[i]) * p;
      }
      const tau = sm * sm * 1.2;
      const a = tau > 1e-4 ? 1 - Math.exp(-dt / tau) : 1;
      let v = gs.fVal[i] + a * (raw - gs.fVal[i]);
      if (!Number.isFinite(v)) v = 0;
      gs.fVal[i] = v;
      src[S_FUNC + i] = v;
    }
    gs.chaosVal = tickChaosSource(gs.chaos, g[P.chaosRate], g[P.chaosMu], g[P.chaosDrive], g[P.chaosAmount], dt);
    src[S_CHAOS] = gs.chaosVal;
    for (let i = 0; i < MACRO_COUNT; i++) src[S_MACRO + i] = g[P.macro + i];
    for (let i = 0; i < XY_COUNT * 2; i++) src[S_XY + i] = g[P.xy + i];
    src[S_MODWHEEL] = gs.modwheel;
    src[S_AFTERTOUCH] = gs.aftertouch;
    src[0] = 0;
  }

  // src/worklets/insanity/modMatrix.js
  function createModMatrix() {
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
      mark: new Uint8Array(PARAM_COUNT)
    };
  }
  function compileMatrix(mm, base) {
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
        mm.vSrc[mm.vCount] = src;
        mm.vDst[mm.vCount] = dst;
        mm.vAmt[mm.vCount] = amt;
        mm.vCount++;
        if (!mm.mark[dst]) {
          mm.mark[dst] = 1;
          mm.vTouched[mm.vTouchedCount++] = dst;
        }
      } else {
        mm.gSrc[mm.gCount] = src;
        mm.gDst[mm.gCount] = dst;
        mm.gAmt[mm.gCount] = amt;
        mm.gCount++;
        if (!mm.mark[dst]) {
          mm.mark[dst] = 1;
          mm.gTouched[mm.gTouchedCount++] = dst;
        }
      }
    }
  }
  function applyGlobal(mm, base, g, src) {
    if (mm.gCount === 0) return;
    const acc = mm.acc;
    for (let t = 0; t < mm.gTouchedCount; t++) {
      const d2 = mm.gTouched[t];
      acc[d2] = toNorm(PARAMS[d2], base[d2]);
    }
    for (let s = 0; s < mm.gCount; s++) acc[mm.gDst[s]] += mm.gAmt[s] * src[mm.gSrc[s]];
    for (let t = 0; t < mm.gTouchedCount; t++) {
      const d2 = mm.gTouched[t];
      const v = acc[d2];
      g[d2] = fromNorm(PARAMS[d2], Number.isFinite(v) ? v : 0);
    }
  }
  function applyVoice(mm, base, pv, src) {
    for (let i = 0; i < VOICE_PARAM_END; i++) pv[i] = base[i];
    if (mm.vCount === 0) return;
    const acc = mm.acc;
    for (let t = 0; t < mm.vTouchedCount; t++) {
      const d2 = mm.vTouched[t];
      acc[d2] = toNorm(PARAMS[d2], base[d2]);
    }
    for (let s = 0; s < mm.vCount; s++) acc[mm.vDst[s]] += mm.vAmt[s] * src[mm.vSrc[s]];
    for (let t = 0; t < mm.vTouchedCount; t++) {
      const d2 = mm.vTouched[t];
      const v = acc[d2];
      pv[d2] = fromNorm(PARAMS[d2], Number.isFinite(v) ? v : 0);
    }
  }

  // src/worklets/insanity/osc.js
  var MODE_OFF = 0;
  var MODE_SINE = 1;
  var MODE_SQUARE = 4;
  var MODE_NOISE = 5;
  var MODE_WAVETABLE = 6;
  var MODE_FM = 7;
  var MODE_ADDITIVE = 8;
  var MODE_CHAOS = 9;
  var MAX_UNISON = 8;
  var ADD_PARTIALS = 16;
  var SIN_N = 4096;
  var SIN = new Float32Array(SIN_N + 1);
  for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin(2 * Math.PI * i / SIN_N);
  function sinT(p) {
    const x = p * SIN_N;
    const i = x | 0;
    const a = SIN[i];
    return a + (SIN[i + 1] - a) * (x - i);
  }
  var WT_N = 2048;
  var WT_FRAMES = 5;
  var WT_LEVELS = 10;
  var WT_STRIDE = WT_N + 1;
  var WT = new Float32Array(WT_FRAMES * WT_LEVELS * WT_STRIDE);
  function harmonicAmp(frame, h) {
    switch (frame) {
      case 0:
        return h === 1 ? 1 : 0;
      case 1:
        return h & 1 ? (h - 1 >> 1 & 1 ? -1 : 1) / (h * h) : 0;
      case 2:
        return 1 / h;
      case 3:
        return h & 1 ? 1 / h : 0;
      default: {
        const a = Math.exp(-(((h - 4) / 1.6) ** 2)) + 0.6 * Math.exp(-(((h - 11) / 2.6) ** 2)) + 0.35 * Math.exp(-(((h - 24) / 4) ** 2));
        return (a + 0.15 / h) / Math.pow(h, 0.3);
      }
    }
  }
  (() => {
    const bS = new Float32Array(WT_N);
    for (let i = 0; i < WT_N; i++) bS[i] = Math.sin(2 * Math.PI * i / WT_N);
    const acc = new Float64Array(WT_N);
    for (let f = 0; f < WT_FRAMES; f++) {
      acc.fill(0);
      let hDone = 0;
      for (let l = WT_LEVELS - 1; l >= 0; l--) {
        const hMax = Math.max(1, 512 >> l);
        for (let h = hDone + 1; h <= hMax; h++) {
          const a = harmonicAmp(f, h);
          if (a === 0) continue;
          for (let i = 0; i < WT_N; i++) acc[i] += a * bS[h * i & WT_N - 1];
        }
        hDone = hMax;
        const base = (f * WT_LEVELS + l) * WT_STRIDE;
        for (let i = 0; i < WT_N; i++) WT[base + i] = acc[i];
        WT[base + WT_N] = acc[0];
      }
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
  function wtLevel(inc) {
    if (inc <= 0) return 0;
    let l = Math.ceil(Math.log2(1024 * inc));
    return l < 0 ? 0 : l >= WT_LEVELS ? WT_LEVELS - 1 : l;
  }
  function blep(t, dt) {
    if (t < dt) {
      t /= dt;
      return t + t - t * t - 1;
    }
    if (t > 1 - dt) {
      t = (t - 1) / dt;
      return t * t + t + t + 1;
    }
    return 0;
  }
  function waveSine(q, dt, sh) {
    const d2 = sh < 0.02 ? 0.02 : sh > 0.98 ? 0.98 : sh;
    return sinT(q < d2 ? q * 0.5 / d2 : 0.5 + (q - d2) * 0.5 / (1 - d2));
  }
  function waveTri(q, dt, sh) {
    const d2 = sh < 0.02 ? 0.02 : sh > 0.98 ? 0.98 : sh;
    return q < d2 ? -1 + q * 2 / d2 : 1 - (q - d2) * 2 / (1 - d2);
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
  var WAVE = [null, waveSine, waveTri, waveSaw, waveSquare];
  function renderSynced(vs, o, L, R, len, mode) {
    const U = vs.oscU[o];
    const wave = WAVE[mode];
    const sh = vs.oscShape[o];
    const sync = vs.oscSync[o];
    const win = vs.oscWin[o];
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
          q = p / inc * incS;
          if (q >= 1) q -= Math.floor(q);
        }
      }
      vs.uPh[k] = p;
      vs.uPh2[k] = q;
    }
  }
  function synced(vs, o) {
    return vs.oscSync[o] > 1.0005;
  }
  function renderSine(vs, o, L, R, len) {
    if (synced(vs, o)) return renderSynced(vs, o, L, R, len, 1);
    const U = vs.oscU[o];
    const d2 = Math.min(0.98, Math.max(0.02, vs.oscShape[o]));
    const pure = d2 > 0.495 && d2 < 0.505;
    const s1 = 0.5 / d2, s2 = 0.5 / (1 - d2);
    for (let u = 0; u < U; u++) {
      const k = o * MAX_UNISON + u;
      let p = vs.uPh[k];
      const inc = vs.uInc[k], gl = vs.uGL[k], gr = vs.uGR[k];
      for (let i = 0; i < len; i++) {
        const q = pure ? p : p < d2 ? p * s1 : 0.5 + (p - d2) * s2;
        const s = sinT(q);
        L[i] += s * gl;
        R[i] += s * gr;
        p += inc;
        if (p >= 1) p -= 1;
      }
      vs.uPh[k] = p;
    }
  }
  function renderTri(vs, o, L, R, len) {
    if (synced(vs, o)) return renderSynced(vs, o, L, R, len, 2);
    const U = vs.oscU[o];
    const d2 = Math.min(0.98, Math.max(0.02, vs.oscShape[o]));
    const s1 = 2 / d2, s2 = 2 / (1 - d2);
    for (let u = 0; u < U; u++) {
      const k = o * MAX_UNISON + u;
      let p = vs.uPh[k];
      const inc = vs.uInc[k], gl = vs.uGL[k], gr = vs.uGR[k];
      for (let i = 0; i < len; i++) {
        const s = p < d2 ? -1 + p * s1 : 1 - (p - d2) * s2;
        L[i] += s * gl;
        R[i] += s * gr;
        p += inc;
        if (p >= 1) p -= 1;
      }
      vs.uPh[k] = p;
    }
  }
  function renderSaw(vs, o, L, R, len) {
    if (synced(vs, o)) return renderSynced(vs, o, L, R, len, 3);
    const U = vs.oscU[o];
    const sh = vs.oscShape[o];
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
  function renderSquare(vs, o, L, R, len) {
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
  function renderNoise(vs, o, L, R, len) {
    const U = vs.oscU[o];
    const sh = vs.oscShape[o];
    const det = vs.oscDet[o];
    const hold = vs.oscAux[o];
    const bpMix = vs.oscWin[o];
    const bpRatio = vs.oscRatio[o] * 0.5;
    let r = vs.rng | 0;
    for (let u = 0; u < U; u++) {
      const k = o * MAX_UNISON + u;
      const t = U === 1 ? 0 : u / (U - 1) * 2 - 1;
      let cs = sh * Math.pow(2, t * det * 1.5);
      cs = cs > 1 ? 1 : cs;
      const c = 0.015 + 0.985 * cs * cs;
      const comp = Math.min(8, Math.sqrt((2 - c) / c)) * 0.6 * vs.oscSync[o];
      let y = vs.uPh2[k];
      let hp = vs.uPh[k], hv = vs.addPh[k * ADD_PARTIALS];
      const hInc = hold > 0 ? vs.uInc[k] * hold : 0;
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
        r ^= r << 13;
        r ^= r >>> 17;
        r ^= r << 5;
        let w = (r | 0) * 4656612873077393e-25;
        if (hInc > 0) {
          hp += hInc;
          if (hp >= 1) {
            hp -= Math.floor(hp);
            hv = w;
          }
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
      if (!(Math.abs(ic1) < 1e6) || !(Math.abs(ic2) < 1e6)) {
        ic1 = 0;
        ic2 = 0;
      }
      vs.uPh2[k] = y;
      vs.uPh[k] = hp;
      vs.addPh[k * ADD_PARTIALS] = hv;
      vs.vx[k] = ic1;
      vs.vv[k] = ic2;
    }
    vs.rng = r | 0 || 2654435769;
  }
  function renderWavetable(vs, o, L, R, len) {
    const U = vs.oscU[o];
    const pos = Math.min(0.9999, Math.max(0, vs.oscShape[o])) * (WT_FRAMES - 1);
    const fa = pos | 0;
    const fb = fa + 1 < WT_FRAMES ? fa + 1 : fa;
    const mix = pos - fa;
    const lvl = vs.oscAux[o] | 0;
    const ba = (fa * WT_LEVELS + lvl) * WT_STRIDE;
    const bb = (fb * WT_LEVELS + lvl) * WT_STRIDE;
    const knee = vs.oscWin[o];
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
  function renderFm(vs, o, L, R, len) {
    const U = vs.oscU[o];
    const ratio = vs.oscRatio[o];
    const index = vs.oscAux[o];
    const ix = index * 0.15915494309189535;
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
  function renderAdditive(vs, o, L, R, len) {
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
  function renderChaos(vs, o, L, R, len) {
    const U = vs.oscU[o];
    const mu = vs.oscShape[o];
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
      if (!(Math.abs(x) < 6) || !(Math.abs(v) < 100)) {
        x = 0.5;
        v = 0;
      }
      vs.vx[k] = x;
      vs.vv[k] = v;
      vs.uPh2[k] = pm;
    }
  }
  var RENDER = [
    null,
    renderSine,
    renderTri,
    renderSaw,
    renderSquare,
    renderNoise,
    renderWavetable,
    renderFm,
    renderAdditive,
    renderChaos
  ];

  // src/worklets/insanity/voices.js
  var CTL = 32;
  var VOICE_MIX = 0.32;
  var DC_R = 0.9987;
  var IDLE = 0;
  var ATTACK = 1;
  var DECAY = 2;
  var SUSTAIN = 3;
  var RELEASE = 4;
  var LN_1PCT = 4.605;
  var NU = OSC_COUNT * MAX_UNISON;
  function softclip(x) {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }
  function createVoice() {
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
      aStage: IDLE,
      aLvl: 0,
      aInc: 0,
      aDec: 0,
      aSus: 1,
      aRel: 0,
      // filter env + mod envs (control rate)
      fStage: IDLE,
      fLvl: 0,
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
      oscSync: new Float64Array(OSC_COUNT),
      // sync speed (x the note) for sine/tri/saw/square
      oscWin: new Float64Array(OSC_COUNT),
      // CZ window depth / wavetable bend knee / noise band-pass mix
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
      rng: Math.random() * 2147483647 | 1,
      // filters: coef [g,k,a1,a2,a3] x 2; state [ic1,ic2] x (2 filters x 2 ch)
      fc: new Float64Array(10),
      fType: new Int8Array(2),
      fDrive: new Float64Array(2),
      fComp: new Float64Array(2),
      fs: new Float64Array(8),
      dc: new Float64Array(4),
      // DC blocker state [xL, yL, xR, yR]
      parallel: false,
      // scratch
      bL: new Float32Array(CTL),
      bR: new Float32Array(CTL)
    };
  }
  function createVoicePool() {
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
  function silenceVoice(v) {
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
  function poolNoteOn(pool, base, id, freq, note, vel) {
    if (!(freq > 0) || !Number.isFinite(freq)) return;
    const voices = pool.voices;
    const poly = Math.max(1, Math.min(MAX_VOICES, Math.round(base[P.polyphony]) || 1));
    for (; ; ) {
      let sounding = 0;
      for (const v2 of voices) if (v2.active && !v2.killed) sounding++;
      if (sounding < poly) break;
      let victim = null;
      for (const v2 of voices) {
        if (!v2.active || v2.killed || v2.aStage !== RELEASE) continue;
        if (!victim || v2.aLvl < victim.aLvl) victim = v2;
      }
      if (!victim) for (const v2 of voices) {
        if (!v2.active || v2.killed) continue;
        if (!victim || v2.age < victim.age) victim = v2;
      }
      if (!victim) break;
      victim.killed = true;
      victim.aStage = RELEASE;
    }
    let v = null;
    for (const x of voices) if (!x.active) {
      v = x;
      break;
    }
    let reused = false;
    if (!v) {
      for (const x of voices) if (x.killed && (!v || x.aLvl < v.aLvl)) v = x;
      if (!v) {
        for (const x of voices) if (!v || x.age < v.age) v = x;
      }
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
    v.curLog = glide > 5e-4 && Number.isFinite(pool.lastLog) ? pool.lastLog : v.targetLog;
    if (glide > 5e-4 && reused && v.active) v.curLog = pool.lastLog;
    pool.lastLog = v.targetLog;
    if (!reused || !v.active) {
      resetVoiceState(v);
      v.aLvl = 0;
      v.fLvl = 0;
      v.mLvl.fill(0);
    }
    for (let k = 0; k < NU; k++) v.uPh[k] = rand01();
    for (let k = 0; k < v.addPh.length; k++) v.addPh[k] = rand01();
    for (let k = 0; k < NU; k++) {
      v.vx[k] = 0.5 + 0.2 * rand01();
      v.vv[k] = 0;
    }
    v.cDet.fill(NaN);
    v.active = true;
    v.killed = false;
    v.aStage = ATTACK;
    v.fStage = ATTACK;
    v.mStage.fill(ATTACK);
    pool.mostRecent = v;
  }
  function poolNoteOff(pool, id) {
    for (const v of pool.voices) {
      if (v.active && v.id === id && v.aStage !== RELEASE) releaseVoice(v);
    }
  }
  function releaseVoice(v) {
    v.aStage = RELEASE;
    v.fStage = RELEASE;
    for (let i = 0; i < ENV_COUNT; i++) if (v.mStage[i] !== IDLE) v.mStage[i] = RELEASE;
  }
  function poolAllNotesOff(pool) {
    for (const v of pool.voices) if (v.active) releaseVoice(v);
  }
  function poolPanic(pool) {
    for (const v of pool.voices) silenceVoice(v);
    pool.lastLog = NaN;
    pool.mostRecent = null;
  }
  function envStep(stageArr, lvlArr, i, a, d2, s, r, dt) {
    let lvl = lvlArr[i];
    switch (stageArr[i]) {
      case ATTACK:
        lvl += dt / Math.max(5e-4, a);
        if (lvl >= 1) {
          lvl = 1;
          stageArr[i] = DECAY;
        }
        break;
      case DECAY:
      case SUSTAIN:
        lvl = s + (lvl - s) * Math.exp(-LN_1PCT * dt / Math.max(5e-4, d2));
        break;
      case RELEASE:
        lvl *= Math.exp(-LN_1PCT * dt / Math.max(5e-4, r));
        if (lvl < 1e-4) {
          lvl = 0;
          stageArr[i] = IDLE;
        }
        break;
      default:
        lvl = 0;
    }
    lvlArr[i] = lvl;
    return lvl;
  }
  var fStageArr = new Uint8Array(1);
  var fLvlArr = new Float32Array(1);
  function fillVoiceSources(v, src) {
    for (let i = 0; i < ENV_COUNT; i++) src[S_ENV + i] = v.mLvl[i];
    src[S_VELOCITY] = v.vel;
    let kt = (v.note - 60) / 60;
    src[S_KEYTRACK] = kt < -1 ? -1 : kt > 1 ? 1 : kt;
    src[S_NOTERANDOM] = v.noteRand;
    src[S_AMPENV] = v.aLvl;
    src[S_FILTERENV] = v.fLvl;
  }
  function clearVoiceSources(src) {
    for (let i = 0; i < ENV_COUNT; i++) src[S_ENV + i] = 0;
    src[S_VELOCITY] = src[S_KEYTRACK] = src[S_NOTERANDOM] = src[S_AMPENV] = src[S_FILTERENV] = 0;
  }
  function voiceControl(v, ctx) {
    const sr = ctx.sr, g = ctx.g, dt = CTL / sr;
    for (let i = 0; i < ENV_COUNT; i++) {
      if (v.mStage[i] === IDLE) continue;
      const b = P.env + i * P.envStride;
      envStep(v.mStage, v.mLvl, i, g[b + P.eA], g[b + P.eD], g[b + P.eS], g[b + P.eR], dt);
    }
    fillVoiceSources(v, ctx.src);
    applyVoice(ctx.mm, ctx.base, v.pv, ctx.src);
    const pv = v.pv;
    fStageArr[0] = v.fStage;
    fLvlArr[0] = v.fLvl;
    envStep(fStageArr, fLvlArr, 0, pv[P.fenvA], pv[P.fenvD], pv[P.fenvS], pv[P.fenvR], dt);
    v.fStage = fStageArr[0];
    v.fLvl = fLvlArr[0];
    v.aInc = 1 / Math.max(1, pv[P.ampA] * sr);
    v.aDec = Math.exp(-LN_1PCT / Math.max(1, pv[P.ampD] * sr));
    v.aSus = pv[P.ampS];
    v.aRel = v.killed ? Math.exp(-LN_1PCT / (6e-3 * sr)) : Math.exp(-LN_1PCT / Math.max(1, pv[P.ampR] * sr));
    const glide = pv[P.glide];
    if (glide > 5e-4) v.curLog += (v.targetLog - v.curLog) * (1 - Math.exp(-3 * dt / glide));
    else v.curLog = v.targetLog;
    const bendSemis = ctx.bend * ctx.base[P.bendRange];
    const freq = Math.exp(v.curLog + bendSemis * Math.LN2 / 12);
    const destroy = ctx.destroy;
    let n = 0;
    for (let o = 0; o < OSC_COUNT; o++) {
      const b = P.osc + o * P.oscStride;
      const mode = Math.round(pv[b + P.oMode]);
      const level = pv[b + P.oLevel];
      v.oscMode[o] = mode;
      if (mode === MODE_OFF || !(level > 1e-4) || mode < 0 || mode > MODE_CHAOS) continue;
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
      if (v.cU[o] !== U || v.cDet[o] !== det || v.cPan[o] !== pan) {
        const newU = v.cU[o] !== U || Number.isNaN(v.cDet[o]);
        v.cU[o] = U;
        v.cDet[o] = det;
        v.cPan[o] = pan;
        const spread = U > 1 ? destroy ? 1 : 0.8 : 0;
        for (let u = 0; u < U; u++) {
          const k = o * MAX_UNISON + u;
          const t = U === 1 ? 0 : u / (U - 1) * 2 - 1;
          v.detRatio[k] = Math.pow(2, t * det * 50 / 1200);
          let pp = pan + t * spread;
          pp = pp < -1 ? -1 : pp > 1 ? 1 : pp;
          const th = (pp + 1) * 0.125;
          v.panL[k] = sinT(th + 0.25);
          v.panR[k] = sinT(th);
          if (newU && U === 1) v.uPh[k] = 0;
        }
      }
      const semis = pv[b + P.oCoarse] + pv[b + P.oFine] / 100;
      const inc0 = freq * Math.pow(2, semis / 12) / sr;
      const gain = pv[b + P.oLevel] * oscNorm / Math.sqrt(U);
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
      const rl = Math.log2(Math.max(0.25, Math.min(16, v.oscRatio[o])) / 2);
      if (mode >= MODE_SINE && mode <= MODE_SQUARE) {
        if (rl > 7e-4) {
          v.oscSync[o] = Math.pow(2, rl);
          v.oscWin[o] = 0;
        } else if (rl < -7e-4) {
          v.oscSync[o] = Math.pow(2, -rl);
          v.oscWin[o] = Math.min(1, -rl);
        }
      } else if (mode === MODE_NOISE) {
        v.oscAux[o] = 0;
        if (rl < -7e-4) {
          const a2 = Math.min(1, -rl / 3);
          const f = inc0 * sr;
          const rate = Math.exp(Math.log(sr) * (1 - a2) + Math.log(2 * f) * a2);
          v.oscAux[o] = rate / Math.max(1e-3, f);
          v.oscSync[o] = 1 / (1 + 1.4 * a2);
        } else if (rl > 7e-4) v.oscWin[o] = Math.min(1, rl / 1.5);
      }
      if (mode === MODE_WAVETABLE) {
        v.oscAux[o] = wtLevel(inc0 * v.detRatio[o * MAX_UNISON + U - 1]);
        let knee = 0.5 - 0.15 * rl;
        v.oscWin[o] = knee < 0.04 ? 0.04 : knee > 0.96 ? 0.96 : knee;
      } else if (mode === MODE_FM) {
        const ratio = v.oscRatio[o];
        let idx = v.oscShape[o] * 10;
        const lim = 0.22 / Math.max(1e-6, inc0 * ratio) - 1;
        if (idx > lim) idx = lim > 0 ? lim : 0;
        v.oscAux[o] = idx;
      } else if (mode === MODE_ADDITIVE) {
        const r = v.oscRatio[o], s = v.oscShape[o];
        if (v.cAddR[o] !== r || v.cAddS[o] !== s) {
          v.cAddR[o] = r;
          v.cAddS[o] = s;
          let stretch = 1 + Math.log2(r) / 8;
          stretch = stretch < 0.5 ? 0.5 : stretch > 1.6 ? 1.6 : stretch;
          const tilt = (1 - s) * 2.4;
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
          let os = Math.ceil(Math.max(1, dT / 0.06, dT * mu / 0.12));
          if (os > 8) os = 8;
          v.chOs[k] = os;
          v.chDt[k] = dT / os;
        }
      }
    }
    const kt = (v.note - 60) / 12;
    for (let f = 0; f < 2; f++) {
      const b = P.vf1 + f * P.vfStride;
      let fc = pv[b + P.fCutoff] * Math.pow(2, pv[b + P.fEnvAmt] * v.fLvl * 7 + pv[b + P.fKeytrack] * kt);
      const fmax = sr * 0.45;
      fc = fc < 16 ? 16 : fc > fmax ? fmax : fc;
      if (!Number.isFinite(fc)) fc = 1e3;
      const reso = pv[b + P.fReso];
      const gg = Math.tan(Math.PI * fc / sr);
      const k = 2 - 1.92 * (reso < 0 ? 0 : reso > 1 ? 1 : reso);
      const a1 = 1 / (1 + gg * (gg + k));
      const c = f * 5;
      v.fc[c] = gg;
      v.fc[c + 1] = k;
      v.fc[c + 2] = a1;
      v.fc[c + 3] = gg * a1;
      v.fc[c + 4] = gg * gg * a1;
      v.fType[f] = Math.round(pv[b + P.fType]);
      const dr = pv[b + P.fDrive];
      v.fDrive[f] = dr > 1e-3 ? 1 + dr * 6 : 0;
      v.fComp[f] = (dr > 1e-3 ? 1 / (1 + dr * 1.5) : 1) * (1 - 0.4 * reso);
    }
    v.parallel = Math.round(pv[P.vfRouting]) === 1;
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
      case 1:
        return x - c[ci + 1] * v1 - v2;
      case 2:
        return c[ci + 1] * v1;
      case 3:
        return x - c[ci + 1] * v1;
      default:
        return v2;
    }
  }
  function filt(v, f, ch, x) {
    const dr = v.fDrive[f];
    if (dr !== 0) x = softclip(x * dr);
    return svf(v.fs, f * 4 + ch * 2, v.fc, f * 5, v.fType[f], x) * v.fComp[f];
  }
  function voiceRender(v, outL, outR, off, len) {
    const bL = v.bL, bR = v.bR;
    for (let i = 0; i < len; i++) {
      bL[i] = 0;
      bR[i] = 0;
    }
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
        if (lvl >= 1) {
          lvl = 1;
          st = DECAY;
        }
      } else if (st === DECAY || st === SUSTAIN) {
        lvl = sus + (lvl - sus) * dec;
      } else if (st === RELEASE) {
        lvl *= rel;
        if (lvl < 1e-5) {
          lvl = 0;
          st = IDLE;
        }
      } else {
        lvl = 0;
      }
      const il = bL[i], ir = bR[i];
      const dl = il - dc[0] + DC_R * dc[1];
      const dr = ir - dc[2] + DC_R * dc[3];
      dc[0] = il;
      dc[1] = dl;
      dc[2] = ir;
      dc[3] = dr;
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
    if (!Number.isFinite(lastL) || !Number.isFinite(dc[1]) || !Number.isFinite(v.fs[0]) || !Number.isFinite(v.fs[3]) || !Number.isFinite(v.fs[5]) || !Number.isFinite(v.fs[7])) {
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

  // src/worklets/insanity/filterBank.js
  var BUS_CHUNK = 32;
  var BQ_PEAK = 0;
  var BQ_LP = 1;
  var BQ_HP = 2;
  var BQ_BP = 3;
  var BQ_LOWSHELF = 5;
  var BQ_HIGHSHELF = 6;
  var ROWS = 4;
  var ROW_LEN = 8;
  var N = BANK_BANDS;
  var TWO_PI3 = Math.PI * 2;
  var DENORM = 1e-20;
  var I_ON = new Int32Array(N);
  var I_TYPE = new Int32Array(N);
  var I_FREQ = new Int32Array(N);
  var I_Q = new Int32Array(N);
  var I_GAIN = new Int32Array(N);
  var I_PAR = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const p = `bank${i + 1}`;
    I_ON[i] = paramIndex(`${p}.on`);
    I_TYPE[i] = paramIndex(`${p}.type`);
    I_FREQ[i] = paramIndex(`${p}.freq`);
    I_Q[i] = paramIndex(`${p}.q`);
    I_GAIN[i] = paramIndex(`${p}.gain`);
    I_PAR[i] = paramIndex(`${p}.parallel`);
  }
  var I_MIX = paramIndex("bank.mix");
  function makeBiquad() {
    return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1l: 0, z2l: 0, z1r: 0, z2r: 0 };
  }
  function biquadReset(bq) {
    bq.z1l = 0;
    bq.z2l = 0;
    bq.z1r = 0;
    bq.z2r = 0;
  }
  function biquadFlush(bq) {
    if (Math.abs(bq.z1l) < DENORM) bq.z1l = 0;
    if (Math.abs(bq.z2l) < DENORM) bq.z2l = 0;
    if (Math.abs(bq.z1r) < DENORM) bq.z1r = 0;
    if (Math.abs(bq.z2r) < DENORM) bq.z2r = 0;
  }
  function biquadCoeffs(bq, type, freq, q, gainDb, sr) {
    const f = freq < 10 ? 10 : freq > sr * 0.45 ? sr * 0.45 : freq;
    const qq = q < 0.05 ? 0.05 : q;
    const w0 = TWO_PI3 * f / sr;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * qq);
    let b0, b1, b2, a0, a1, a2;
    if (type === BQ_PEAK) {
      const A = Math.pow(10, gainDb / 40);
      b0 = 1 + alpha * A;
      b1 = -2 * cw;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cw;
      a2 = 1 - alpha / A;
    } else if (type === BQ_LOWSHELF || type === BQ_HIGHSHELF) {
      const A = Math.pow(10, gainDb / 40);
      const sa = 2 * Math.sqrt(A) * (sw / 2) * Math.SQRT2;
      if (type === BQ_LOWSHELF) {
        b0 = A * (A + 1 - (A - 1) * cw + sa);
        b1 = 2 * A * (A - 1 - (A + 1) * cw);
        b2 = A * (A + 1 - (A - 1) * cw - sa);
        a0 = A + 1 + (A - 1) * cw + sa;
        a1 = -2 * (A - 1 + (A + 1) * cw);
        a2 = A + 1 + (A - 1) * cw - sa;
      } else {
        b0 = A * (A + 1 + (A - 1) * cw + sa);
        b1 = -2 * A * (A - 1 + (A + 1) * cw);
        b2 = A * (A + 1 + (A - 1) * cw - sa);
        a0 = A + 1 - (A - 1) * cw + sa;
        a1 = 2 * (A - 1 - (A + 1) * cw);
        a2 = A + 1 - (A - 1) * cw - sa;
      }
    } else {
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      if (type === BQ_LP) {
        b0 = (1 - cw) / 2;
        b1 = 1 - cw;
        b2 = (1 - cw) / 2;
      } else if (type === BQ_HP) {
        b0 = (1 + cw) / 2;
        b1 = -(1 + cw);
        b2 = (1 + cw) / 2;
      } else if (type === BQ_BP) {
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
      } else {
        b0 = 1;
        b1 = -2 * cw;
        b2 = 1;
      }
      const g = Math.pow(10, gainDb / 20);
      b0 *= g;
      b1 *= g;
      b2 *= g;
    }
    const inv = 1 / a0;
    bq.b0 = b0 * inv;
    bq.b1 = b1 * inv;
    bq.b2 = b2 * inv;
    bq.a1 = a1 * inv;
    bq.a2 = a2 * inv;
  }
  function biquadRun(bq, L, R, off, len) {
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
    bq.z1l = z1l;
    bq.z2l = z2l;
    bq.z1r = z1r;
    bq.z2r = z2r;
  }
  function makeBand() {
    return {
      b0: 1,
      b1: 0,
      b2: 0,
      a1: 0,
      a2: 0,
      z1l: 0,
      z2l: 0,
      z1r: 0,
      z2r: 0,
      // targets from params
      on: false,
      type: 0,
      par: false,
      tFreq: 1e3,
      tQ: 1,
      tGain: 0,
      // what is actually running
      curType: 0,
      curPar: false,
      freq: 1e3,
      q: 1,
      gain: 0,
      amt: 0,
      amt0: 0,
      live: false
    };
  }
  function createFilterBank(sampleRate2) {
    const sr = sampleRate2 > 0 ? sampleRate2 : 48e3;
    const bands = [];
    for (let i = 0; i < N; i++) bands.push(makeBand());
    return {
      sr,
      bands,
      mixT: 1,
      mix: 1,
      fadeStep: BUS_CHUNK / (8e-3 * sr),
      alpha: 1 - Math.exp(-BUS_CHUNK / (0.012 * sr)),
      mixAlpha: 1 - Math.exp(-BUS_CHUNK / (0.02 * sr)),
      inL: new Float32Array(BUS_CHUNK),
      inR: new Float32Array(BUS_CHUNK),
      dryL: new Float32Array(BUS_CHUNK),
      dryR: new Float32Array(BUS_CHUNK),
      wsum: new Float32Array(BUS_CHUNK),
      primed: false
    };
  }
  function fin(v, dflt) {
    return v === v && v !== Infinity && v !== -Infinity ? v : dflt;
  }
  function bankSetValues(fb, values) {
    const nyq = fb.sr * 0.45;
    for (let i = 0; i < N; i++) {
      const b = fb.bands[i];
      b.on = values[I_ON[i]] >= 0.5;
      let t = Math.round(fin(values[I_TYPE[i]], 0));
      b.type = t < 0 ? 0 : t > 4 ? 4 : t;
      b.par = values[I_PAR[i]] >= 0.5;
      const f = fin(values[I_FREQ[i]], 1e3);
      b.tFreq = f < 20 ? 20 : f > nyq ? nyq : f;
      const q = fin(values[I_Q[i]], 1);
      b.tQ = q < 0.1 ? 0.1 : q > 18 ? 18 : q;
      const g = fin(values[I_GAIN[i]], 0);
      b.tGain = g < -18 ? -18 : g > 18 ? 18 : g;
    }
    const m = fin(values[I_MIX], 1);
    fb.mixT = m < 0 ? 0 : m > 1 ? 1 : m;
    if (!fb.primed) {
      fb.primed = true;
      fb.mix = fb.mixT;
    }
  }
  function bankReset(fb) {
    for (let i = 0; i < N; i++) {
      const b = fb.bands[i];
      biquadReset(b);
      b.amt = 0;
      b.amt0 = 0;
      b.live = false;
    }
    fb.mix = fb.mixT;
  }
  function updateBand(fb, b) {
    if (b.amt === 0) {
      if (!b.on) {
        b.live = false;
        return false;
      }
      b.curType = b.type;
      b.curPar = b.par;
      b.freq = b.tFreq;
      b.q = b.tQ;
      b.gain = b.tGain;
      biquadCoeffs(b, b.curType, b.freq, b.q, b.gain, fb.sr);
      biquadReset(b);
    }
    b.live = true;
    const target = b.on && b.curType === b.type && b.curPar === b.par ? 1 : 0;
    b.amt0 = b.amt;
    if (target > b.amt) {
      const a = b.amt + fb.fadeStep;
      b.amt = a > 1 ? 1 : a;
    } else if (target < b.amt) {
      const a = b.amt - fb.fadeStep;
      b.amt = a < 0 ? 0 : a;
    }
    if (b.freq !== b.tFreq || b.q !== b.tQ || b.gain !== b.tGain) {
      const al = fb.alpha;
      const rf = b.tFreq / b.freq;
      b.freq = rf > 0.9999 && rf < 1.0001 ? b.tFreq : b.freq * Math.exp(al * Math.log(rf));
      const rq = b.tQ / b.q;
      b.q = rq > 0.9999 && rq < 1.0001 ? b.tQ : b.q * Math.exp(al * Math.log(rq));
      const dg = b.tGain - b.gain;
      b.gain = dg > -5e-3 && dg < 5e-3 ? b.tGain : b.gain + dg * al;
      biquadCoeffs(b, b.curType, b.freq, b.q, b.gain, fb.sr);
    }
    return true;
  }
  function runSeries(b, L, R, off, len) {
    const a0 = b.amt0, a1 = b.amt;
    if (a0 === 1 && a1 === 1) {
      biquadRun(b, L, R, off, len);
      return;
    }
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
    b.z1l = z1l;
    b.z2l = z2l;
    b.z1r = z1r;
    b.z2r = z2r;
  }
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
    b.z1l = z1l;
    b.z2l = z2l;
    b.z1r = z1r;
    b.z2r = z2r;
  }
  function bankProcess(fb, L, R, off, len) {
    const bands = fb.bands;
    let anyLive = false;
    for (let i = 0; i < N; i++) if (updateBand(fb, bands[i])) anyLive = true;
    if (!anyLive) {
      fb.mix = fb.mixT;
      return;
    }
    const m0 = fb.mix;
    const dm = fb.mixT - m0;
    const m1 = dm > -1e-4 && dm < 1e-4 ? fb.mixT : m0 + dm * fb.mixAlpha;
    fb.mix = m1;
    const needDry = m0 < 1 || m1 < 1;
    const dryL = fb.dryL, dryR = fb.dryR;
    if (needDry) for (let k = 0; k < len; k++) {
      dryL[k] = L[off + k];
      dryR[k] = R[off + k];
    }
    const inL = fb.inL, inR = fb.inR, wsum = fb.wsum;
    for (let r = 0; r < ROWS; r++) {
      const base = r * ROW_LEN;
      let hasSeries = false, hasPar = false;
      for (let k = 0; k < ROW_LEN; k++) {
        const b = bands[base + k];
        if (!b.live) continue;
        if (b.curPar) hasPar = true;
        else hasSeries = true;
      }
      if (!hasSeries && !hasPar) continue;
      if (hasPar) {
        for (let k = 0; k < len; k++) {
          inL[k] = L[off + k];
          inR[k] = R[off + k];
          wsum[k] = 1;
        }
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
      const d2 = (m1 - m0) / len;
      for (let k = 0; k < len; k++) {
        const m = m0 + d2 * (k + 1);
        L[off + k] = dryL[k] + m * (L[off + k] - dryL[k]);
        R[off + k] = dryR[k] + m * (R[off + k] - dryR[k]);
      }
    }
    for (let i = 0; i < N; i++) if (bands[i].live) biquadFlush(bands[i]);
  }

  // src/worklets/insanity/fxChain.js
  var TWO_PI4 = Math.PI * 2;
  var HALF_PI = Math.PI / 2;
  var ANTI_DENORM = 1e-24;
  var I = {
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
    width: paramIndex("fx.width")
  };
  var S_DRIVE_GAIN = 0;
  var S_DRIVE_MAKEUP = 1;
  var S_DRIVE_MIX = 2;
  var S_CRUSH_MIX = 3;
  var S_RING_MIX = 4;
  var S_PHASER_MIX = 5;
  var S_PHASER_DEPTH = 6;
  var S_CHORUS_MIX = 7;
  var S_CHORUS_DEPTH = 8;
  var S_DELAY_MIX = 9;
  var S_DELAY_FB = 10;
  var S_REV_MIX = 11;
  var S_WIDTH = 12;
  var S_COUNT = 13;
  var REV_LINE_MS = [31.3, 37.9, 43.1, 47.9, 53.7, 59.3, 66.1, 71.9];
  var REV_DIFF_MS = [4.77, 3.59, 12.73, 9.31];
  var REV_DIFF_G = 0.6;
  var REV_OUT_L = [1, -1, 1, -1, 1, 1, -1, -1];
  var REV_OUT_R = [1, 1, -1, -1, -1, 1, 1, -1];
  function sat(x) {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }
  function pow2AtLeast(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }
  function fin2(v, d2) {
    return v === v && v !== Infinity && v !== -Infinity ? v : d2;
  }
  function clamp(v, lo, hi, d2) {
    const x = fin2(v, d2);
    return x < lo ? lo : x > hi ? hi : x;
  }
  function createFx(sampleRate2) {
    const sr = sampleRate2 > 0 ? sampleRate2 : 48e3;
    const delaySize = pow2AtLeast(Math.ceil(1.25 * sr) + 8);
    const chorusSize = pow2AtLeast(Math.ceil(0.05 * sr) + 8);
    const revLen = new Int32Array(8);
    const revBuf = [];
    for (let k = 0; k < 8; k++) {
      revLen[k] = Math.max(16, Math.round(REV_LINE_MS[k] * sr / 1e3));
      revBuf.push(new Float32Array(revLen[k]));
    }
    const diffLen = new Int32Array(4);
    const diffBuf = [];
    for (let k = 0; k < 4; k++) {
      diffLen[k] = Math.max(4, Math.round(REV_DIFF_MS[k] * sr / 1e3));
      diffBuf.push(new Float32Array(diffLen[k]));
    }
    const fx = {
      sr,
      alpha: 1 - Math.exp(-BUS_CHUNK / (0.02 * sr)),
      cur: new Float64Array(S_COUNT),
      prev: new Float64Array(S_COUNT),
      tgt: new Float64Array(S_COUNT),
      // crusher
      crushBits: 16,
      crushStep: 1 / 32768,
      crushRate: 1,
      crushPhase: 0,
      crushHoldL: 0,
      crushHoldR: 0,
      // ring
      ringFreqT: 220,
      ringFreq: 220,
      ringC: 1,
      ringS: 0,
      ringCw: 1,
      ringSw: 0,
      // phaser
      phRate: 0.3,
      phPhase: 0,
      phFb: 0.35,
      phZL: new Float64Array(6),
      phZR: new Float64Array(6),
      phLastL: 0,
      phLastR: 0,
      // chorus
      chRate: 0.4,
      chPhase: 0,
      chBufL: new Float32Array(chorusSize),
      chBufR: new Float32Array(chorusSize),
      chMask: chorusSize - 1,
      chW: 0,
      chActive: false,
      // delay
      dlBufL: new Float32Array(delaySize),
      dlBufR: new Float32Array(delaySize),
      dlMask: delaySize - 1,
      dlW: 0,
      dlTimeT: 0.375 * sr,
      dlTime: 0.375 * sr,
      dlTimeCoef: 1 - Math.exp(-1 / (0.08 * sr)),
      dlMaxTime: 1.2 * sr,
      dlDampC: 0.5,
      dlLpL: 0,
      dlLpR: 0,
      dlActive: false,
      // reverb
      revBuf,
      revLen,
      revW: new Int32Array(8),
      revLp: new Float64Array(8),
      revG: new Float64Array(8),
      revSizeT: -1,
      revDampT: -1,
      revDampC: 0.5,
      revTmp: new Float64Array(8),
      revActive: false,
      diffBuf,
      diffLen,
      diffW: new Int32Array(4),
      primed: false
    };
    fx.tgt[S_DRIVE_GAIN] = 1;
    fx.tgt[S_DRIVE_MAKEUP] = 1;
    fx.tgt[S_WIDTH] = 1;
    fx.tgt[S_PHASER_DEPTH] = 0.6;
    fx.tgt[S_CHORUS_DEPTH] = 0.3;
    fx.tgt[S_DELAY_FB] = 0.35;
    for (let k = 0; k < S_COUNT; k++) {
      fx.cur[k] = fx.tgt[k];
      fx.prev[k] = fx.tgt[k];
    }
    setRevParams(fx, 0.6, 0.5);
    setRingFreq(fx, 220);
    return fx;
  }
  function setRevParams(fx, size, damp) {
    if (size !== fx.revSizeT) {
      fx.revSizeT = size;
      const t60 = 0.25 * Math.pow(40, size);
      for (let k = 0; k < 8; k++) fx.revG[k] = Math.pow(10, -3 * fx.revLen[k] / (fx.sr * t60));
    }
    if (damp !== fx.revDampT) {
      fx.revDampT = damp;
      const fc = Math.min(fx.sr * 0.45, 18e3 * Math.pow(0.04, damp));
      fx.revDampC = 1 - Math.exp(-TWO_PI4 * fc / fx.sr);
    }
  }
  function setRingFreq(fx, f) {
    fx.ringFreq = f;
    const w = TWO_PI4 * f / fx.sr;
    fx.ringCw = Math.cos(w);
    fx.ringSw = Math.sin(w);
  }
  function fxSetValues(fx, v) {
    const sr = fx.sr;
    const t = fx.tgt;
    const db = clamp(v[I.driveDb], 0, 24, 0);
    const g = Math.pow(10, db / 20);
    t[S_DRIVE_GAIN] = g;
    t[S_DRIVE_MAKEUP] = 1 / Math.sqrt(g);
    t[S_DRIVE_MIX] = clamp(v[I.driveMix], 0, 1, 0);
    const bits = Math.round(clamp(v[I.crushBits], 2, 16, 16));
    if (bits !== fx.crushBits) {
      fx.crushBits = bits;
      fx.crushStep = 1 / Math.pow(2, bits - 1);
    }
    fx.crushRate = clamp(v[I.crushRate], 1, 32, 1);
    t[S_CRUSH_MIX] = clamp(v[I.crushMix], 0, 1, 0);
    fx.ringFreqT = clamp(v[I.ringFreq], 1, 4e3, 220);
    t[S_RING_MIX] = clamp(v[I.ringMix], 0, 1, 0);
    fx.phRate = clamp(v[I.phaserRate], 0.05, 8, 0.3);
    t[S_PHASER_DEPTH] = clamp(v[I.phaserDepth], 0, 1, 0.6);
    t[S_PHASER_MIX] = clamp(v[I.phaserMix], 0, 1, 0);
    fx.chRate = clamp(v[I.chorusRate], 0.05, 6, 0.4);
    t[S_CHORUS_DEPTH] = clamp(v[I.chorusDepth], 0, 1, 0.3);
    t[S_CHORUS_MIX] = clamp(v[I.chorusMix], 0, 1, 0);
    fx.dlTimeT = Math.min(fx.dlMaxTime, clamp(v[I.delayTime], 15, 1200, 375) * sr / 1e3);
    t[S_DELAY_FB] = clamp(v[I.delayFb], 0, 0.95, 0.35);
    const dd = clamp(v[I.delayDamp], 0, 1, 0.4);
    const dfc = Math.min(sr * 0.45, 2e4 * Math.pow(0.025, dd));
    fx.dlDampC = 1 - Math.exp(-TWO_PI4 * dfc / sr);
    t[S_DELAY_MIX] = clamp(v[I.delayMix], 0, 1, 0.15);
    setRevParams(fx, clamp(v[I.revSize], 0, 1, 0.6), clamp(v[I.revDamp], 0, 1, 0.5));
    t[S_REV_MIX] = clamp(v[I.revMix], 0, 1, 0.2);
    t[S_WIDTH] = clamp(v[I.width], 0, 2, 1);
    if (!fx.primed) {
      fx.primed = true;
      for (let k = 0; k < S_COUNT; k++) {
        fx.cur[k] = t[k];
        fx.prev[k] = t[k];
      }
      setRingFreq(fx, fx.ringFreqT);
      fx.dlTime = fx.dlTimeT;
    }
  }
  function fxReset(fx) {
    fx.crushPhase = 0;
    fx.crushHoldL = 0;
    fx.crushHoldR = 0;
    fx.ringC = 1;
    fx.ringS = 0;
    fx.phZL.fill(0);
    fx.phZR.fill(0);
    fx.phLastL = 0;
    fx.phLastR = 0;
    fx.chBufL.fill(0);
    fx.chBufR.fill(0);
    fx.chW = 0;
    fx.chActive = false;
    fx.dlBufL.fill(0);
    fx.dlBufR.fill(0);
    fx.dlW = 0;
    fx.dlLpL = 0;
    fx.dlLpR = 0;
    fx.dlActive = false;
    fx.dlTime = fx.dlTimeT;
    for (let k = 0; k < 8; k++) fx.revBuf[k].fill(0);
    fx.revW.fill(0);
    fx.revLp.fill(0);
    fx.revActive = false;
    for (let k = 0; k < 4; k++) fx.diffBuf[k].fill(0);
    fx.diffW.fill(0);
  }
  function drive(fx, L, R, off, len) {
    const d2 = 1 / len;
    const g0 = fx.prev[S_DRIVE_GAIN], dg = (fx.cur[S_DRIVE_GAIN] - g0) * d2;
    const u0 = fx.prev[S_DRIVE_MAKEUP], du = (fx.cur[S_DRIVE_MAKEUP] - u0) * d2;
    const m0 = fx.prev[S_DRIVE_MIX], dm = (fx.cur[S_DRIVE_MIX] - m0) * d2;
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
    fx.crushPhase = ph;
    fx.crushHoldL = hl;
    fx.crushHoldR = hr;
  }
  function ring(fx, L, R, off, len) {
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
    const n = 1 / Math.sqrt(c * c + s * s);
    fx.ringC = c * n;
    fx.ringS = s * n;
  }
  var PH_SUB = 8;
  function phaser(fx, L, R, off, len) {
    const sr = fx.sr;
    const m0 = fx.prev[S_PHASER_MIX], dm = (fx.cur[S_PHASER_MIX] - m0) / len;
    const depth = fx.cur[S_PHASER_DEPTH];
    const inc = fx.phRate / sr;
    const zl = fx.phZL, zr = fx.phZR, fb = fx.phFb;
    const center = Math.log(700);
    const span = depth * Math.log(40) * 0.5;
    let ph = fx.phPhase, lastL = fx.phLastL, lastR = fx.phLastR;
    let aL = 0, aR = 0;
    for (let k = 0; k < len; k++) {
      if ((k & PH_SUB - 1) === 0) {
        const lfoL = Math.sin(TWO_PI4 * ph);
        const lfoR = Math.cos(TWO_PI4 * ph);
        const tL = Math.tan(Math.PI * Math.exp(center + span * lfoL) / sr);
        const tR = Math.tan(Math.PI * Math.exp(center + span * lfoR) / sr);
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
      lastL = yl;
      lastR = yr;
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
    if (!fx.chActive) {
      fx.chBufL.fill(0);
      fx.chBufR.fill(0);
      fx.chActive = true;
    }
    const m0 = fx.prev[S_CHORUS_MIX], dm = (fx.cur[S_CHORUS_MIX] - m0) / len;
    const base = 0.014 * sr;
    const dep = (3e-4 + fx.cur[S_CHORUS_DEPTH] * 6e-3) * sr;
    const inc = fx.chRate / sr;
    const bl = fx.chBufL, br = fx.chBufR, mask = fx.chMask;
    let w = fx.chW, ph = fx.chPhase;
    for (let k = 0; k < len; k++) {
      const i = off + k;
      const xl = L[i], xr = R[i];
      bl[w] = xl;
      br[w] = xr;
      const sn = Math.sin(TWO_PI4 * ph), cs = Math.cos(TWO_PI4 * ph);
      ph += inc;
      if (ph >= 1) ph -= 1;
      let d2 = base + dep * sn, p = w - d2, ip = Math.floor(p), fr = p - ip;
      let a = bl[ip & mask], b = bl[ip + 1 & mask];
      let wl = a + fr * (b - a);
      d2 = base - dep * sn;
      p = w - d2;
      ip = Math.floor(p);
      fr = p - ip;
      a = bl[ip & mask];
      b = bl[ip + 1 & mask];
      wl = 0.5 * (wl + a + fr * (b - a));
      d2 = base + dep * cs;
      p = w - d2;
      ip = Math.floor(p);
      fr = p - ip;
      a = br[ip & mask];
      b = br[ip + 1 & mask];
      let wr = a + fr * (b - a);
      d2 = base - dep * cs;
      p = w - d2;
      ip = Math.floor(p);
      fr = p - ip;
      a = br[ip & mask];
      b = br[ip + 1 & mask];
      wr = 0.5 * (wr + a + fr * (b - a));
      const m = m0 + dm * (k + 1);
      L[i] = xl + m * (wl - xl);
      R[i] = xr + m * (wr - xr);
      w = w + 1 & mask;
    }
    fx.chW = w;
    fx.chPhase = ph;
  }
  function delay(fx, L, R, off, len) {
    if (!fx.dlActive) {
      fx.dlBufL.fill(0);
      fx.dlBufR.fill(0);
      fx.dlLpL = 0;
      fx.dlLpR = 0;
      fx.dlTime = fx.dlTimeT;
      fx.dlActive = true;
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
      let a = bl[ip & mask], b = bl[ip + 1 & mask];
      const rl = a + fr * (b - a);
      a = br[ip & mask];
      b = br[ip + 1 & mask];
      const rr = a + fr * (b - a);
      lpL += dc * (rl - lpL);
      lpR += dc * (rr - lpR);
      const fb = f0 + df * s;
      const xl = L[i], xr = R[i];
      bl[w] = 0.5 * (xl + xr) + sat(fb * lpR) + ANTI_DENORM;
      br[w] = sat(fb * lpL) + ANTI_DENORM;
      const dry = dry0 + dDry * s, wet = wet0 + dWet * s;
      L[i] = xl * dry + rl * wet;
      R[i] = xr * dry + rr * wet;
      w = w + 1 & mask;
    }
    fx.dlW = w;
    fx.dlTime = t;
    fx.dlLpL = Math.abs(lpL) < 1e-20 ? 0 : lpL;
    fx.dlLpR = Math.abs(lpR) < 1e-20 ? 0 : lpR;
  }
  var REV_WET_GAIN = 0.32;
  function reverb(fx, L, R, off, len) {
    if (!fx.revActive) {
      for (let k = 0; k < 8; k++) fx.revBuf[k].fill(0);
      for (let k = 0; k < 4; k++) fx.diffBuf[k].fill(0);
      fx.revLp.fill(0);
      fx.revActive = true;
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
      let x = 0.5 * (xl + xr);
      for (let d2 = 0; d2 < 4; d2++) {
        const b = dbuf[d2];
        const j = dw[d2];
        const z = b[j];
        const v = x + REV_DIFF_G * z;
        b[j] = v;
        x = z - REV_DIFF_G * v;
        dw[d2] = j + 1 >= dlen[d2] ? 0 : j + 1;
      }
      let outL = 0, outR = 0;
      for (let n = 0; n < 8; n++) {
        const y = buf[n][rw[n]];
        lp[n] += dc * (y - lp[n]);
        tmp[n] = lp[n];
        outL += REV_OUT_L[n] * y;
        outR += REV_OUT_R[n] * y;
      }
      let a0 = tmp[0] + tmp[1], a1 = tmp[0] - tmp[1], a2 = tmp[2] + tmp[3], a3 = tmp[2] - tmp[3];
      let a4 = tmp[4] + tmp[5], a5 = tmp[4] - tmp[5], a6 = tmp[6] + tmp[7], a7 = tmp[6] - tmp[7];
      let b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3;
      let b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
      tmp[0] = (b0 + b4) * H;
      tmp[1] = (b1 + b5) * H;
      tmp[2] = (b2 + b6) * H;
      tmp[3] = (b3 + b7) * H;
      tmp[4] = (b0 - b4) * H;
      tmp[5] = (b1 - b5) * H;
      tmp[6] = (b2 - b6) * H;
      tmp[7] = (b3 - b7) * H;
      for (let n = 0; n < 8; n++) {
        const j = rw[n];
        buf[n][j] = tmp[n] * g[n] + (n & 1 ? -x : x) + ANTI_DENORM;
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
  function fxProcess(fx, L, R, off, len) {
    const cur = fx.cur, prev = fx.prev, tgt = fx.tgt, al = fx.alpha;
    for (let k = 0; k < S_COUNT; k++) {
      const c = cur[k];
      prev[k] = c;
      const d2 = tgt[k] - c;
      cur[k] = d2 > -1e-5 && d2 < 1e-5 ? tgt[k] : c + d2 * al;
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

  // src/worklets/insanity/master.js
  var I_LOW = paramIndex("master.eqLow");
  var I_MID = paramIndex("master.eqMid");
  var I_MIDF = paramIndex("master.eqMidFreq");
  var I_HIGH = paramIndex("master.eqHigh");
  var I_THRESH = paramIndex("master.compThresh");
  var I_RATIO = paramIndex("master.compRatio");
  var I_ATT = paramIndex("master.compAttack");
  var I_REL = paramIndex("master.compRelease");
  var I_CEIL = paramIndex("master.ceiling");
  var I_CLIP = paramIndex("master.clipper");
  var I_VOL = paramIndex("master.volume");
  var LOW_F = 120;
  var HIGH_F = 8e3;
  var MID_Q = 0.8;
  var KNEE = 6;
  var DB_PER_NEPER = 20 / Math.LN10;
  var NEPER_PER_DB = Math.LN10 / 20;
  function fin3(v, d2) {
    return v === v && v !== Infinity && v !== -Infinity ? v : d2;
  }
  function clamp2(v, lo, hi, d2) {
    const x = fin3(v, d2);
    return x < lo ? lo : x > hi ? hi : x;
  }
  function sat2(x) {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }
  function makeEqBand(type, f, q) {
    const b = makeBiquad();
    return Object.assign(b, { type, f, q, tF: f, gain: 0, tGain: 0 });
  }
  function createMaster(sampleRate2) {
    const sr = sampleRate2 > 0 ? sampleRate2 : 48e3;
    const W = Math.max(8, Math.round(15e-4 * sr));
    const m = {
      sr,
      alpha: 1 - Math.exp(-BUS_CHUNK / (0.02 * sr)),
      low: makeEqBand(BQ_LOWSHELF, LOW_F, 0.707),
      mid: makeEqBand(BQ_PEAK, 1200, MID_Q),
      high: makeEqBand(BQ_HIGHSHELF, HIGH_F, 0.707),
      // compressor
      thresh: -12,
      ratioInv: 1 / 3,
      attMs: 10,
      relMs: 120,
      attC: 0,
      relC: 0,
      grDb: 0,
      grMax: 0,
      // clipper (amount smoothed)
      clipT: 0,
      clip: 0,
      // volume (linear, smoothed)
      volT: 0.5,
      vol: 0.5,
      // limiter
      ceil: Math.pow(10, -0.3 / 20),
      W,
      limRelC: 1 - Math.exp(-1 / (0.08 * sr)),
      reqBuf: new Float64Array(W),
      // required gain, last W samples
      avgBuf: new Float64Array(W),
      // released gain, last W samples (moving average)
      dlyL: new Float64Array(W),
      dlyR: new Float64Array(W),
      // W-1 sample delay (ring of W)
      pos: 0,
      avgSum: W,
      rel: 1,
      bad: false,
      primed: false
    };
    setCompTimes(m, 10, 120);
    masterReset(m);
    return m;
  }
  function setCompTimes(m, attMs, relMs) {
    m.attC = 1 - Math.exp(-1 / (attMs * 1e-3 * m.sr));
    m.relC = 1 - Math.exp(-1 / (relMs * 1e-3 * m.sr));
  }
  function masterSetValues(m, v) {
    m.low.tGain = clamp2(v[I_LOW], -15, 15, 0);
    m.mid.tGain = clamp2(v[I_MID], -15, 15, 0);
    m.mid.tF = clamp2(v[I_MIDF], 200, 8e3, 1200);
    m.high.tGain = clamp2(v[I_HIGH], -15, 15, 0);
    m.thresh = clamp2(v[I_THRESH], -48, 0, -12);
    m.ratioInv = 1 / clamp2(v[I_RATIO], 1, 20, 3);
    const att = clamp2(v[I_ATT], 0.1, 100, 10);
    const rel = clamp2(v[I_REL], 10, 1e3, 120);
    if (att !== m.attMs || rel !== m.relMs) {
      m.attMs = att;
      m.relMs = rel;
      setCompTimes(m, att, rel);
    }
    m.ceil = Math.pow(10, clamp2(v[I_CEIL], -12, 0, -0.3) / 20);
    m.clipT = clamp2(v[I_CLIP], 0, 1, 0);
    m.volT = Math.pow(10, clamp2(v[I_VOL], -60, 6, -6) / 20);
    if (!m.primed) {
      m.primed = true;
      m.vol = m.volT;
      m.clip = m.clipT;
      for (const b of [m.low, m.mid, m.high]) {
        b.gain = b.tGain;
        b.f = b.tF;
        biquadCoeffs(b, b.type, b.f, b.q, b.gain, m.sr);
      }
    }
  }
  function masterReset(m) {
    biquadReset(m.low);
    biquadReset(m.mid);
    biquadReset(m.high);
    m.grDb = 0;
    m.reqBuf.fill(1);
    m.avgBuf.fill(1);
    m.dlyL.fill(0);
    m.dlyR.fill(0);
    m.pos = 0;
    m.avgSum = m.W;
    m.rel = 1;
    m.bad = false;
  }
  function masterTakeGr(m) {
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
      if (b.gain === 0 && b.tGain === 0) {
        biquadReset(b);
        return;
      }
    } else if (b.gain === 0) {
      return;
    }
    biquadRun(b, L, R, off, len);
    biquadFlush(b);
  }
  function masterProcess(m, L, R, off, len) {
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
      const al2 = l < 0 ? -l : l, ar = r < 0 ? -r : r;
      const pk = al2 > ar ? al2 : ar;
      let target = 0;
      if (pk > 1e-6) {
        const over = DB_PER_NEPER * Math.log(pk) - thresh;
        if (over >= KNEE * 0.5) target = -slope * over;
        else if (over > -KNEE * 0.5) {
          const o = over + KNEE * 0.5;
          target = -slope * o * o / (2 * KNEE);
        }
      }
      gr += (target - gr) * (target > gr ? attC : relC);
      if (gr > 1e-6) {
        const g2 = Math.exp(-gr * NEPER_PER_DB);
        l *= g2;
        r *= g2;
        if (gr > grMax) grMax = gr;
      }
      if (doClip) {
        const t = t0 + (t1 - t0) * s, kk = k0 + (k1 - k0) * s;
        const it = 1 / t;
        l += kk * (t * sat2(l * it) - l);
        r += kk * (t * sat2(r * it) - r);
      }
      const vol = v0 + (v1 - v0) * s;
      l *= vol;
      r *= vol;
      if (!(l < 1e6 && l > -1e6) || !(r < 1e6 && r > -1e6)) {
        bad = true;
        l = 0;
        r = 0;
      }
      const al3 = l < 0 ? -l : l, ar3 = r < 0 ? -r : r;
      const p = al3 > ar3 ? al3 : ar3;
      req[pos] = p > ceil ? ceil / p : 1;
      let h = 1;
      for (let j = 0; j < W; j++) {
        const q = req[j];
        if (q < h) h = q;
      }
      rel += (1 - rel) * limRel;
      if (h < rel) rel = h;
      sum += rel - avg[pos];
      avg[pos] = rel;
      const rp = pos + 1 === W ? 0 : pos + 1;
      const ol = dl[rp], or = dr[rp];
      dl[pos] = l;
      dr[pos] = r;
      const g = sum * invW;
      let yl = ol * g, yr = or * g;
      if (yl > ceil) yl = ceil;
      else if (yl < -ceil) yl = -ceil;
      if (yr > ceil) yr = ceil;
      else if (yr < -ceil) yr = -ceil;
      L[i] = yl;
      R[i] = yr;
      pos = rp;
      if (pos === 0) {
        let t = 0;
        for (let j = 0; j < W; j++) t += avg[j];
        sum = t;
      }
    }
    m.grDb = gr;
    m.grMax = grMax;
    m.pos = pos;
    m.avgSum = sum;
    m.rel = rel;
    if (bad) m.bad = true;
  }

  // src/worklets/insanity/bus.js
  var SCOPE_LEN = 128;
  var SCOPE_DECIM = 8;
  function createBus(sampleRate2) {
    const sr = sampleRate2 > 0 ? sampleRate2 : 48e3;
    return {
      sr,
      bank: createFilterBank(sr),
      fx: createFx(sr),
      master: createMaster(sr),
      peakL: 0,
      peakR: 0,
      sumL: 0,
      sumR: 0,
      count: 0,
      meters: { peakL: 0, peakR: 0, rmsL: 0, rmsR: 0, gainReductionDb: 0 },
      scopeRing: new Float32Array(SCOPE_LEN),
      scopeOut: new Float32Array(SCOPE_LEN),
      scopePos: 0,
      scopeDecim: 0,
      scopeAcc: 0
    };
  }
  function busSetValues(bus, values) {
    bankSetValues(bus.bank, values);
    fxSetValues(bus.fx, values);
    masterSetValues(bus.master, values);
  }
  function busPanic(bus) {
    bankReset(bus.bank);
    fxReset(bus.fx);
    masterReset(bus.master);
  }
  function busProcess(bus, L, R, n) {
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
        for (let i = off; i < n; i++) {
          L[i] = 0;
          R[i] = 0;
        }
        break;
      }
    }
    let pL = bus.peakL, pR = bus.peakR, sL = bus.sumL, sR = bus.sumR;
    const ring2 = bus.scopeRing;
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
        ring2[sp] = 0.5 * (l + r);
        sp = sp + 1 === SCOPE_LEN ? 0 : sp + 1;
      }
    }
    bus.peakL = pL;
    bus.peakR = pR;
    bus.sumL = sL;
    bus.sumR = sR;
    bus.count += n;
    bus.scopePos = sp;
    bus.scopeDecim = sd;
  }
  function busMeters(bus) {
    const m = bus.meters;
    const c = bus.count > 0 ? bus.count : 1;
    m.peakL = bus.peakL;
    m.peakR = bus.peakR;
    m.rmsL = Math.sqrt(bus.sumL / c);
    m.rmsR = Math.sqrt(bus.sumR / c);
    m.gainReductionDb = masterTakeGr(bus.master);
    bus.peakL = 0;
    bus.peakR = 0;
    bus.sumL = 0;
    bus.sumR = 0;
    bus.count = 0;
    return m;
  }
  function busScope(bus) {
    const out = bus.scopeOut, ring2 = bus.scopeRing;
    let p = bus.scopePos;
    for (let i = 0; i < SCOPE_LEN; i++) {
      out[i] = ring2[p];
      p = p + 1 === SCOPE_LEN ? 0 : p + 1;
    }
    return out;
  }

  // src/worklets/insanity/index.js
  var MAX_BLOCK = 4096;
  function nowMs() {
    const p = globalThis.performance;
    return p && typeof p.now === "function" ? p.now() : Date.now();
  }
  var InsanityProcessor = class extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.sr = typeof sampleRate === "number" && sampleRate > 0 ? sampleRate : 48e3;
      this.base = new Float32Array(PARAM_COUNT);
      for (let i = 0; i < PARAM_COUNT; i++) this.base[i] = PARAMS[i].def;
      const init = options && options.processorOptions && options.processorOptions.values;
      if (init && init.length) this.writeAll(init);
      this.g = new Float32Array(PARAM_COUNT);
      this.g.set(this.base);
      this.src = new Float32Array(SRC_COUNT);
      reseed(Math.random() * 2147483647 | 1);
      this.gs = createGlobalSources();
      this.mm = createModMatrix();
      this.pool = createVoicePool();
      this.bus = createBus(this.sr);
      this.dirty = true;
      this.busDirty = true;
      this.bend = 0;
      this.ctlPos = 0;
      this.mixL = new Float32Array(MAX_BLOCK);
      this.mixR = new Float32Array(MAX_BLOCK);
      this.viewN = -1;
      this.viewL = this.mixL;
      this.viewR = this.mixR;
      this.ctx = { sr: this.sr, base: this.base, g: this.g, mm: this.mm, src: this.src, bend: 0, destroy: false };
      this.meterEvery = Math.max(1, Math.round(this.sr / 30));
      this.meterCount = 0;
      this.cpuMs = 0;
      this.cpuSamples = 0;
      this.cpu = 0;
      this.meter = {
        type: "meters",
        peakL: 0,
        peakR: 0,
        rmsL: 0,
        rmsR: 0,
        voices: 0,
        cpu: 0,
        gainReductionDb: 0,
        lfo: new Float32Array(LFO_COUNT),
        env: new Float32Array(ENV_COUNT),
        func: new Float32Array(FUNC_COUNT),
        chaos: 0,
        scope: new Float32Array(128)
      };
      this.port.onmessage = (e) => {
        try {
          this.onMessage(e.data);
        } catch (err) {
          this.port.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
        }
      };
      this.port.postMessage({ type: "ready" });
    }
    writeAll(values) {
      const n = Math.min(values.length, PARAM_COUNT);
      for (let i = 0; i < n; i++) this.base[i] = clampParam(PARAMS[i], Number(values[i]));
    }
    onMessage(m) {
      if (!m || typeof m !== "object") return;
      switch (m.type) {
        case "setAll":
          if (m.values) this.writeAll(m.values);
          this.dirty = true;
          break;
        case "params": {
          const idx = m.idx, val = m.val;
          if (!idx || !val) break;
          const n = Math.min(idx.length, val.length);
          for (let k = 0; k < n; k++) {
            const i = idx[k];
            if (i >= 0 && i < PARAM_COUNT) this.base[i] = clampParam(PARAMS[i], val[k]);
          }
          this.dirty = true;
          break;
        }
        case "noteOn":
          poolNoteOn(this.pool, this.base, m.id, m.freq, m.note, m.vel);
          break;
        case "noteOff":
          poolNoteOff(this.pool, m.id);
          break;
        case "allNotesOff":
          poolAllNotesOff(this.pool);
          break;
        case "panic":
          poolPanic(this.pool);
          busPanic(this.bus);
          break;
        case "controller": {
          const v = Number(m.value);
          if (!Number.isFinite(v)) break;
          if (m.name === "modwheel") this.gs.modwheel = Math.min(1, Math.max(0, v));
          else if (m.name === "aftertouch") this.gs.aftertouch = Math.min(1, Math.max(0, v));
          else if (m.name === "pitchBend") this.bend = Math.min(1, Math.max(-1, v));
          break;
        }
        default:
          break;
      }
    }
    controlTick() {
      if (this.dirty) {
        this.dirty = false;
        compileMatrix(this.mm, this.base);
        this.g.set(this.base);
        this.busDirty = true;
      }
      const ctx = this.ctx;
      ctx.bend = this.bend;
      ctx.destroy = this.base[P.destroyCpu] >= 0.5;
      tickGlobalSources(this.gs, this.g, this.src, CTL / this.sr);
      const mr = this.pool.mostRecent;
      if (mr && mr.active) fillVoiceSources(mr, this.src);
      else clearVoiceSources(this.src);
      if (this.mm.gCount > 0) {
        applyGlobal(this.mm, this.base, this.g, this.src);
        this.busDirty = true;
      }
      const voices = this.pool.voices;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (v.active) voiceControl(v, ctx);
      }
    }
    process(inputs, outputs) {
      const t0 = nowMs();
      const out = outputs[0];
      if (!out || out.length === 0) return true;
      const oL = out[0];
      const oR = out.length > 1 ? out[1] : null;
      const n = Math.min(oL.length, MAX_BLOCK);
      const L = this.mixL, R = this.mixR;
      for (let i = 0; i < n; i++) {
        L[i] = 0;
        R[i] = 0;
      }
      const voices = this.pool.voices;
      let pos = 0;
      while (pos < n) {
        if (this.ctlPos <= 0) {
          this.controlTick();
          this.ctlPos = CTL;
        }
        const len = Math.min(this.ctlPos, n - pos);
        for (let i = 0; i < voices.length; i++) {
          const v = voices[i];
          if (v.active) voiceRender(v, L, R, pos, len);
        }
        pos += len;
        this.ctlPos -= len;
      }
      const inp = inputs && inputs[0];
      if (inp && inp.length > 0) {
        const iL = inp[0];
        const iR = inp.length > 1 ? inp[1] : iL;
        const m = Math.min(n, iL.length, iR.length);
        for (let i = 0; i < m; i++) {
          L[i] += iL[i];
          R[i] += iR[i];
        }
      }
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(L[i])) L[i] = 0;
        if (!Number.isFinite(R[i])) R[i] = 0;
      }
      if (this.busDirty) {
        busSetValues(this.bus, this.g);
        this.busDirty = this.mm.gCount > 0;
      }
      busProcess(this.bus, this.view(n, 0), this.view(n, 1), n);
      let bad = false;
      for (let i = 0; i < n; i++) {
        let l = L[i], r = R[i];
        if (!Number.isFinite(l)) {
          l = 0;
          bad = true;
        }
        if (!Number.isFinite(r)) {
          r = 0;
          bad = true;
        }
        oL[i] = l > 1 ? 1 : l < -1 ? -1 : l;
        if (oR) oR[i] = r > 1 ? 1 : r < -1 ? -1 : r;
      }
      if (bad) busPanic(this.bus);
      this.cpuMs += nowMs() - t0;
      this.cpuSamples += n;
      this.meterCount += n;
      if (this.meterCount >= this.meterEvery) {
        this.meterCount = 0;
        this.postMeters();
      }
      return true;
    }
    /** Cached fixed-length views of the mix buffers (one allocation per distinct block size). */
    view(n, ch) {
      if (this.viewN !== n) {
        this.viewN = n;
        this.viewL = this.mixL.subarray(0, n);
        this.viewR = this.mixR.subarray(0, n);
      }
      return ch === 0 ? this.viewL : this.viewR;
    }
    postMeters() {
      const m = this.meter;
      const budgetMs = this.cpuSamples / this.sr * 1e3;
      const inst = budgetMs > 0 ? this.cpuMs / budgetMs : 0;
      this.cpu = this.cpu * 0.7 + inst * 0.3;
      this.cpuMs = 0;
      this.cpuSamples = 0;
      const bm = busMeters(this.bus);
      m.peakL = bm ? bm.peakL : 0;
      m.peakR = bm ? bm.peakR : 0;
      m.rmsL = bm ? bm.rmsL : 0;
      m.rmsR = bm ? bm.rmsR : 0;
      m.gainReductionDb = bm ? bm.gainReductionDb : 0;
      let count = 0;
      const voices = this.pool.voices;
      for (let i = 0; i < voices.length; i++) if (voices[i].active) count++;
      m.voices = count;
      m.cpu = this.cpu;
      m.lfo.set(this.gs.lfoVal);
      m.func.set(this.gs.fVal);
      const mr = this.pool.mostRecent;
      if (mr && mr.active) m.env.set(mr.mLvl);
      else m.env.fill(0);
      m.chaos = this.gs.chaosVal;
      const sc = busScope(this.bus);
      if (sc && sc.length) m.scope.set(sc.length > 128 ? sc.subarray(0, 128) : sc);
      this.port.postMessage(m);
    }
  };
  registerProcessor(INSANITY_PROCESSOR_NAME, InsanityProcessor);
})();
