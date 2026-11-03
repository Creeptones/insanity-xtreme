"use client";

// Canvas meters shared by the Performance Monitor and the Master Section. They read
// host.lastMeters inside the shared rAF loop, so meter traffic never re-renders React.

import { memo, useRef } from "react";
import { cn } from "@/lib/cn";
import type { MeterReport } from "@/lib/insanity/protocol";
import { useInsanityHost } from "../InsanityContext";
import { fitCanvas, useFrame } from "./frame";

export type BarKind = "peakL" | "peakR" | "rmsL" | "rmsR" | "gr" | "cpu" | "voices";

const BAR_LABEL: Record<BarKind, string> = { peakL: "PK L", peakR: "PK R", rmsL: "RMS L", rmsR: "RMS R", gr: "GR", cpu: "CPU", voices: "VOX" };

function linToNorm(v: number): number {
  if (!(v > 0)) return 0;
  const db = 20 * Math.log10(v);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

function barValue(m: MeterReport, k: BarKind): number {
  switch (k) {
    case "peakL": return linToNorm(m.peakL);
    case "peakR": return linToNorm(m.peakR);
    case "rmsL": return linToNorm(m.rmsL);
    case "rmsR": return linToNorm(m.rmsR);
    case "gr": return Math.max(0, Math.min(1, m.gainReductionDb / 24));
    case "cpu": return Math.max(0, Math.min(1, m.cpu));
    case "voices": return Math.max(0, Math.min(1, m.voices / 16));
  }
}

/** A row of LED-segment bars with peak hold. */
export const MeterBars = memo(function MeterBars({ bars, className }: { bars: readonly BarKind[]; className?: string }): JSX.Element {
  const host = useInsanityHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ last: null as MeterReport | null, hold: new Float32Array(bars.length), smooth: new Float32Array(bars.length) });

  useFrame(() => {
    const fit = fitCanvas(canvasRef.current);
    if (!fit) return;
    const { g, w, h } = fit;
    const m = host.lastMeters;
    const s = state.current;
    if (s.hold.length !== bars.length) {
      s.hold = new Float32Array(bars.length);
      s.smooth = new Float32Array(bars.length);
    }
    g.fillStyle = "#050506";
    g.fillRect(0, 0, w, h);
    const labelH = 9;
    const bw = w / bars.length;
    const segH = 3;
    const usable = h - labelH - 2;
    const segs = Math.max(4, Math.floor(usable / segH));
    g.font = "bold 7px ui-monospace, monospace";
    g.textAlign = "center";
    g.textBaseline = "bottom";
    bars.forEach((k, i) => {
      const target = m ? barValue(m, k) : 0;
      // fast attack, slow release (frames, not meter reports)
      s.smooth[i] = target > s.smooth[i] ? target : s.smooth[i] * 0.92 + target * 0.08;
      s.hold[i] = Math.max(s.hold[i] * 0.995, s.smooth[i]);
      const lit = Math.round(s.smooth[i] * segs);
      const x = i * bw + bw * 0.18;
      const ww = bw * 0.64;
      for (let sgi = 0; sgi < segs; sgi++) {
        const y = labelH + usable - (sgi + 1) * segH + 1;
        const f = sgi / segs;
        const col = k === "gr" ? "#f59e0b" : k === "cpu" || k === "voices" ? "#22d3ee" : f > 0.9 ? "#ef4444" : f > 0.72 ? "#eab308" : "#22c55e";
        g.fillStyle = sgi < lit ? col : "#141417";
        g.fillRect(x, y, ww, segH - 1);
      }
      const hy = labelH + usable - Math.round(s.hold[i] * segs) * segH + 1;
      if (s.hold[i] > 0.01) {
        g.fillStyle = "#fafafa";
        g.fillRect(x, hy, ww, 1);
      }
      g.fillStyle = "#71717a";
      g.fillText(BAR_LABEL[k], i * bw + bw / 2, labelH);
    });
  });

  return <canvas ref={canvasRef} aria-hidden className={cn("w-full rounded-[2px] border border-zinc-800", className)} />;
});

/** Oscilloscope of meters.scope. */
export const Scope = memo(function Scope({ className, color = "#4ade80" }: { className?: string; color?: string }): JSX.Element {
  const host = useInsanityHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<MeterReport | null>(null);
  const sized = useRef({ w: 0, h: 0 });

  useFrame(() => {
    const m = host.lastMeters;
    const c = canvasRef.current;
    if (!c) return;
    if (m === last.current && c.clientWidth === sized.current.w && c.clientHeight === sized.current.h) return;
    const fit = fitCanvas(c);
    if (!fit) return;
    last.current = m;
    sized.current = { w: fit.w, h: fit.h };
    const { g, w, h } = fit;
    g.fillStyle = "#050506";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#18181b";
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 1; k < 8; k++) { g.moveTo((k * w) / 8, 0); g.lineTo((k * w) / 8, h); }
    for (let k = 1; k < 4; k++) { g.moveTo(0, (k * h) / 4); g.lineTo(w, (k * h) / 4); }
    g.stroke();
    const sc = m?.scope;
    if (!sc || sc.length < 2) return;
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 6;
    g.lineWidth = 1.25;
    g.beginPath();
    for (let k = 0; k < sc.length; k++) {
      const x = (k / (sc.length - 1)) * w;
      const y = h / 2 - Math.max(-1, Math.min(1, sc[k])) * (h / 2 - 2);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.shadowBlur = 0;
  });

  return <canvas ref={canvasRef} aria-hidden className={cn("w-full rounded-[2px] border border-zinc-800", className)} />;
});

/** Plain-text readouts updated straight from the rAF loop. */
export const Readout = memo(function Readout({ label, pick, className }: { label: string; pick: (m: MeterReport) => string; className?: string }): JSX.Element {
  const host = useInsanityHost();
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef<MeterReport | null>(null);
  useFrame(() => {
    const m = host.lastMeters;
    if (!m || m === last.current || !ref.current) return;
    last.current = m;
    ref.current.textContent = pick(m);
  });
  return (
    <div className="flex flex-col items-center rounded-[2px] border border-zinc-800 bg-black/50 px-1 py-0.5">
      <span className="text-[6px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span ref={ref} className={cn("font-mono text-[10px] font-bold leading-tight", className)}>--</span>
    </div>
  );
});

export function dbText(v: number): string {
  if (!(v > 0)) return "-inf";
  const db = 20 * Math.log10(v);
  return db < -99 ? "-inf" : db.toFixed(1);
}
