"use client";

import { memo, useEffect, useRef } from "react";
import { ACCENTS, ParamKnob } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { useInsanityHost } from "../InsanityContext";
import { fitCanvas, useFrame } from "./frame";

const LEN = 240;
const LAG = 3; // delay-embedding lag in meter frames (~100 ms)

/** "CHAOS ENGINE": the Van der Pol source's knobs plus a phase portrait of its live value. */
export const ChaosPanel = memo(function ChaosPanel(): JSX.Element {
  const host = useInsanityHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ring = useRef({ buf: new Float32Array(LEN), count: 0, drawn: -1, scale: 1 });

  useEffect(() => host.onMeters((m) => {
    const r = ring.current;
    r.buf[r.count % LEN] = Number.isFinite(m.chaos) ? m.chaos : 0;
    r.count++;
  }), [host]);

  useFrame(() => {
    const r = ring.current;
    if (r.count === r.drawn) return;
    const fit = fitCanvas(canvasRef.current);
    if (!fit) return;
    r.drawn = r.count;
    const { g, w, h } = fit;
    g.fillStyle = "#050506";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#1c1c20";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    const n = Math.min(r.count, LEN);
    if (n <= LAG + 1) {
      g.fillStyle = "#52525b";
      g.font = "8px monospace";
      g.fillText("AWAITING CHAOS", 4, h - 4);
      return;
    }
    let peak = 0.05;
    for (let k = 0; k < n; k++) peak = Math.max(peak, Math.abs(r.buf[k]));
    r.scale += (peak - r.scale) * 0.05;
    const sx = (w / 2 - 3) / r.scale;
    const sy = (h / 2 - 3) / r.scale;
    let px = 0;
    let py = 0;
    for (let s = LAG; s < n; s++) {
      const at = (r.count - n + s) % LEN;
      const lag = (r.count - n + s - LAG) % LEN;
      const x = w / 2 + r.buf[at] * sx;
      const y = h / 2 - r.buf[lag] * sy;
      if (s > LAG) {
        const age = s / n;
        g.strokeStyle = `rgba(251, 146, 60, ${(0.08 + age * 0.9).toFixed(3)})`;
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      }
      px = x;
      py = y;
    }
    g.fillStyle = "#fde68a";
    g.shadowColor = "#f97316";
    g.shadowBlur = 8;
    g.beginPath(); g.arc(px, py, 2.5, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
  });

  return (
    <Section title="Chaos Engine" className="h-full" bodyClassName="flex gap-1">
      <div className="grid shrink-0 grid-cols-2 content-start justify-items-center gap-y-0.5">
        <ParamKnob id="chaos.mu" label="Mu" size={24} color={ACCENTS[2]} />
        <ParamKnob id="chaos.rate" label="Rate" size={24} color={ACCENTS[2]} />
        <ParamKnob id="chaos.drive" label="Drive" size={24} color={ACCENTS[6]} />
        <ParamKnob id="chaos.amount" label="Amount" size={24} color={ACCENTS[6]} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="text-[7px] uppercase tracking-wider text-zinc-500">Phase portrait x(t) / x(t-τ)</div>
        <canvas ref={canvasRef} aria-hidden className="min-h-[72px] w-full flex-1 rounded-[2px] border border-zinc-800" />
      </div>
    </Section>
  );
});
