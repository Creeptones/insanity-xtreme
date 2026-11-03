"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ENV_COUNT, FUNC_COUNT, LFO_COUNT } from "@/lib/insanity/params";
import type { MeterReport } from "@/lib/insanity/protocol";
import { ACCENTS, ParamKnob, ParamSelect } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { useInsanityHost } from "../InsanityContext";
import { fitCanvas, useFrame } from "./frame";

type Kind = "env" | "lfo" | "func";
const HIST = 48;
const GAP = 2; // px, must match gap-x-0.5 on the cell grid
const KIND_COLOR: Record<Kind, string> = { env: ACCENTS[0], lfo: ACCENTS[1], func: ACCENTS[2] };
const KIND_COUNT: Record<Kind, number> = { env: ENV_COUNT, lfo: LFO_COUNT, func: FUNC_COUNT };

/** Rolling history of every modulator value, written straight from host.onMeters (no React state). */
class History {
  readonly data: Record<Kind, Float32Array> = {
    env: new Float32Array(ENV_COUNT * HIST),
    lfo: new Float32Array(LFO_COUNT * HIST),
    func: new Float32Array(FUNC_COUNT * HIST),
  };
  /** Number of reports pushed so far; head = count % HIST. */
  count = 0;
  push(m: MeterReport): void {
    const head = this.count % HIST;
    (Object.keys(this.data) as Kind[]).forEach((k) => {
      const src = m[k];
      const dst = this.data[k];
      const n = KIND_COUNT[k];
      for (let i = 0; i < n; i++) dst[i * HIST + head] = src && i < src.length ? src[i] : 0;
    });
    this.count++;
  }
}

function CellControls({ kind, i, color }: { kind: Kind; i: number; color: string }): JSX.Element {
  if (kind === "env") {
    return (
      <div className="grid grid-cols-2 justify-items-center">
        <ParamKnob id={`env${i}.attack`} label="A" size={14} color={color} />
        <ParamKnob id={`env${i}.decay`} label="D" size={14} color={color} />
        <ParamKnob id={`env${i}.sustain`} label="S" size={14} color={color} />
        <ParamKnob id={`env${i}.release`} label="R" size={14} color={color} />
      </div>
    );
  }
  const sel = kind === "lfo" ? `lfo${i}.shape` : `func${i}.mode`;
  const k2 = kind === "lfo" ? [`lfo${i}.rate`, "Rate"] : [`func${i}.rate`, "Rate"];
  const k3 = kind === "lfo" ? [`lfo${i}.amount`, "Amt"] : [`func${i}.smooth`, "Smth"];
  return (
    <div className="flex flex-col items-stretch gap-px">
      <ParamSelect id={sel} className="w-full appearance-none px-0 text-center text-[7px]" />
      <div className="grid grid-cols-2 justify-items-center">
        <ParamKnob id={k2[0]} label={k2[1]} size={14} color={color} />
        <ParamKnob id={k3[0]} label={k3[1]} size={14} color={color} />
      </div>
    </div>
  );
}

const Block = memo(function Block({ kind, start, hist }: { kind: Kind; start: number; hist: History }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(-1);
  const color = KIND_COLOR[kind];
  const bipolar = kind !== "env";

  useFrame(() => {
    if (hist.count === drawn.current) return;
    const fit = fitCanvas(canvasRef.current);
    if (!fit) return;
    drawn.current = hist.count;
    const { g, w, h } = fit;
    g.clearRect(0, 0, w, h);
    const cellW = (w - GAP * 7) / 8;
    const data = hist.data[kind];
    const n = Math.min(hist.count, HIST);
    g.lineWidth = 1;
    for (let c = 0; c < 8; c++) {
      const idx = start - 1 + c;
      const x0 = c * (cellW + GAP);
      g.fillStyle = "#050506";
      g.fillRect(x0, 0, cellW, h);
      if (bipolar) {
        g.fillStyle = "#27272a";
        g.fillRect(x0, h / 2, cellW, 1);
      }
      if (n < 2) continue;
      g.strokeStyle = color;
      g.beginPath();
      for (let s = 0; s < n; s++) {
        // oldest → newest, left → right
        const at = (hist.count - n + s) % HIST;
        const v = data[idx * HIST + at];
        const y = bipolar ? h / 2 - v * (h / 2 - 1.5) : h - 1.5 - Math.max(0, Math.min(1, v)) * (h - 3);
        const x = x0 + 1 + (s / (HIST - 1)) * (cellW - 3);
        if (s === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      const v = data[idx * HIST + ((hist.count - 1) % HIST)];
      const y = bipolar ? h / 2 - v * (h / 2 - 1.5) : h - 1.5 - Math.max(0, Math.min(1, v)) * (h - 3);
      g.fillStyle = "#fff";
      g.fillRect(x0 + 1 + ((n - 1) / (HIST - 1)) * (cellW - 3) - 1, y - 1, 2, 2);
    }
  });

  return (
    <div className="relative max-lg:min-w-[720px]">
      <div className="grid grid-cols-8 gap-x-0.5">
        {Array.from({ length: 8 }, (_, c) => {
          const i = start + c;
          return (
            <div key={i} className="flex min-w-0 flex-col">
              <div className="h-2.5 truncate text-center text-[7px] font-bold uppercase leading-[10px]" style={{ color }}>{kind} {i}</div>
              <div className="h-4" />
              <CellControls kind={kind} i={i} color={color} />
            </div>
          );
        })}
      </div>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-2.5 h-4 w-full" />
    </div>
  );
});

const BLOCKS: readonly { kind: Kind; start: number }[] = [
  { kind: "env", start: 1 }, { kind: "env", start: 9 },
  { kind: "lfo", start: 1 }, { kind: "lfo", start: 9 },
  { kind: "func", start: 1 }, { kind: "func", start: 9 },
];

/** "MODULATORS & ENVELOPES (64x)": ENV/LFO/FUNC 1-16 with live sparklines (one shared rAF, no re-renders). */
export const ModulatorsPanel = memo(function ModulatorsPanel(): JSX.Element {
  const host = useInsanityHost();
  const [hist] = useState(() => new History());
  useEffect(() => host.onMeters((m) => hist.push(m)), [host, hist]);
  return (
    <Section title="Modulators & Envelopes" badge="(64x)" className="h-full" bodyClassName="flex flex-col gap-1">
      {BLOCKS.map((b) => (
        <Block key={`${b.kind}${b.start}`} kind={b.kind} start={b.start} hist={hist} />
      ))}
    </Section>
  );
});
