"use client";

import { memo, useEffect, useRef } from "react";
import { OSC_COUNT, OSC_MODES, paramIndex } from "@/lib/insanity/params";
import { ACCENTS } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { useInsanityHost, useParam } from "../InsanityContext";
import { fitCanvas, useFrame } from "./frame";

const WAVETABLE = OSC_MODES.indexOf("wavetable");
const N = 128;

/** Cheap deterministic PRNG so noise/chaos previews do not flicker between redraws. */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** One cycle of an approximation of what the engine plays for this mode. Output roughly -1..1. */
export function oscPreview(mode: string, shape: number, ratio: number): Float32Array {
  const out = new Float32Array(N);
  const TAU = Math.PI * 2;
  for (let k = 0; k < N; k++) {
    const t = k / N;
    let v = 0;
    switch (mode) {
      case "sine": v = Math.sin(TAU * t); break;
      case "tri": v = 1 - 4 * Math.abs(t - 0.5); break;
      case "saw": v = 2 * t - 1; break;
      case "square": v = t < Math.max(0.05, Math.min(0.95, shape)) ? 1 : -1; break;
      case "wavetable": {
        // table position morphs sine → tri → saw → square
        const p = shape * 3;
        const tables = [Math.sin(TAU * t), 1 - 4 * Math.abs(t - 0.5), 2 * t - 1, t < 0.5 ? 1 : -1];
        const a = Math.min(2, Math.floor(p));
        const f = p - a;
        v = tables[a] * (1 - f) + tables[a + 1] * f;
        break;
      }
      case "fm": v = Math.sin(TAU * t + shape * 6 * Math.sin(TAU * Math.round(Math.max(1, ratio)) * t)); break;
      case "additive": {
        const tilt = 0.5 + (1 - shape) * 2;
        const stretch = 1 + (ratio - 2) * 0.01;
        for (let p = 1; p <= 16; p++) v += Math.sin(TAU * t * Math.round(p * stretch * 100) / 100) / Math.pow(p, tilt);
        break;
      }
      default: break;
    }
    out[k] = v;
  }
  if (mode === "noise") {
    const r = rng(7);
    let lp = 0;
    const a = 0.15 + shape * 0.85;
    for (let k = 0; k < N; k++) { lp += (r() * 2 - 1 - lp) * a; out[k] = lp; }
  } else if (mode === "chaos") {
    let x = 0.31;
    const mu = 3.5 + shape * 0.5;
    for (let k = 0; k < N; k++) { x = mu * x * (1 - x); out[k] = x * 2 - 1; }
  }
  let peak = 0;
  for (let k = 0; k < N; k++) peak = Math.max(peak, Math.abs(out[k]));
  if (peak > 0) for (let k = 0; k < N; k++) out[k] /= peak;
  return out;
}

const WtCell = memo(function WtCell({ i }: { i: number }): JSX.Element {
  const host = useInsanityHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dirty = useRef(true);
  const [mode, setMode] = useParam(`osc${i}.mode`);
  const color = ACCENTS[(i - 1) % ACCENTS.length];
  const modeName = OSC_MODES[Math.round(mode)] ?? "off";

  useEffect(() => {
    const ids = ["mode", "shape", "ratio", "level"].map((k) => paramIndex(`osc${i}.${k}`));
    const mark = (): void => { dirty.current = true; };
    const unsubs = ids.map((idx) => host.subscribe(idx, mark));
    dirty.current = true;
    return () => unsubs.forEach((u) => u());
  }, [host, i]);

  useFrame(() => {
    if (!dirty.current) return;
    const fit = fitCanvas(canvasRef.current);
    if (!fit) return;
    dirty.current = false;
    const { g, w, h } = fit;
    const m = OSC_MODES[Math.round(host.getById(`osc${i}.mode`))] ?? "off";
    const level = host.getById(`osc${i}.level`);
    const wave = oscPreview(m, host.getById(`osc${i}.shape`), host.getById(`osc${i}.ratio`));
    g.fillStyle = "#050506";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#1f1f23";
    g.lineWidth = 1;
    for (let gx = 1; gx < 4; gx++) { g.beginPath(); g.moveTo((gx * w) / 4, 0); g.lineTo((gx * w) / 4, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    if (m === "off") return;
    const amp = (h / 2 - 2) * (0.25 + 0.75 * level);
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 4;
    g.lineWidth = 1.25;
    g.beginPath();
    for (let k = 0; k < N; k++) {
      const x = (k / (N - 1)) * w;
      const y = h / 2 - wave[k] * amp;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.shadowBlur = 0;
  });

  return (
    <button
      type="button"
      onClick={() => setMode(WAVETABLE)}
      title={`OSC ${i}: ${modeName}. Click to switch to wavetable mode.`}
      className="flex min-w-0 flex-col gap-px rounded-[2px] border border-zinc-800 bg-black/40 p-0.5 text-left hover:border-zinc-600"
    >
      <div className="flex justify-between text-[7px] font-bold uppercase">
        <span style={{ color }}>WT {i}</span>
        <span className={modeName === "wavetable" ? "text-green-400" : "text-zinc-500"}>{modeName}</span>
      </div>
      <canvas ref={canvasRef} aria-hidden className="h-8 w-full" />
    </button>
  );
});

/** "WAVETABLE UNIVERSE": a live waveform preview per oscillator; click one to make it a wavetable. */
export const WavetablePanel = memo(function WavetablePanel(): JSX.Element {
  return (
    <Section title="Wavetable Universe" className="h-full" bodyClassName="grid grid-cols-4 content-start gap-0.5 max-lg:grid-cols-2">
      {Array.from({ length: OSC_COUNT }, (_, k) => (
        <WtCell key={k} i={k + 1} />
      ))}
    </Section>
  );
});
