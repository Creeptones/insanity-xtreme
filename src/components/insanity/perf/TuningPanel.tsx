"use client";

// INSANITY perf — TUNING SYSTEM DESIGNER. 12-TET, EDOs, Just, Pythagorean, Bohlen-Pierce,
// real Scala .scl import / export, reference A4, and a plot of each degree's deviation
// from the nearest 12-TET semitone (−50..+50 cents).

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_REF_HZ, ScalaError, TUNING_PRESETS, parseScala, toScala, type Tuning } from "@/lib/insanity/perf/tuning";
import { ACCENTS, RawKnob } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { usePerf, usePerfSettings } from "./PerformanceContext";
import { Label, LitButton, MiniSelect } from "./perfUi";

function DeviationPlot({ tuning }: { tuning: Tuning }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#050505";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#1f3b2a";
    g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const y = Math.round((k / 4) * (h - 1)) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    const degs = [0, ...tuning.cents];
    const n = degs.length;
    const bw = w / n;
    g.strokeStyle = "#14532d";
    for (let i = 0; i <= n; i++) {
      const x = Math.round(i * bw) + 0.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    const mid = h / 2;
    const pts: [number, number][] = [];
    degs.forEach((c, i) => {
      const dev = c - Math.round(c / 100) * 100; // −50..+50
      const y = mid - (dev / 50) * (mid - 2);
      const x = i * bw + bw / 2;
      g.fillStyle = Math.abs(dev) < 0.5 ? "#4ade80" : dev > 0 ? "#f59e0b" : "#22d3ee";
      g.fillRect(x - Math.max(1, bw * 0.3), Math.min(y, mid), Math.max(2, bw * 0.6), Math.max(1, Math.abs(y - mid)));
      pts.push([x, y]);
    });
    g.strokeStyle = "#f472b6";
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke();
    g.fillStyle = "#71717a";
    g.font = "8px monospace";
    g.fillText("+50¢", 2, 9);
    g.fillText("−50¢", 2, h - 3);
  }, [tuning]);
  return <canvas ref={ref} className="h-16 w-full rounded-[2px] border border-zinc-800" aria-label="Cents deviation from 12-TET per scale degree" />;
}

export function TuningPanel(): JSX.Element {
  const perf = usePerf();
  const { tuning } = usePerfSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const t = tuning.tuning;
  const names = TUNING_PRESETS.map((p) => p.name);
  const options = names.includes(t.name) ? names : [...names, t.name];

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = parseScala(text, f.name.replace(/\.scl$/i, ""));
      perf.update("tuning", { tuning: parsed });
      setError(null);
    } catch (err) {
      setError(err instanceof ScalaError ? err.message : "Could not read that file");
    }
  };
  const exportScl = (): void => {
    const blob = new Blob([toScala(t)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.name.replace(/[^\w.-]+/g, "_")}.scl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Section title="Tuning System Designer">
      <div className="flex flex-wrap items-end gap-1">
        <MiniSelect
          label="System"
          value={t.name}
          options={options}
          onChange={(name) => {
            const p = TUNING_PRESETS.find((x) => x.name === name);
            if (p) { perf.update("tuning", { tuning: p }); setError(null); }
          }}
        />
        <LitButton on={false} onClick={() => fileRef.current?.click()} title="Import a Scala .scl file">Import .scl</LitButton>
        <LitButton on={false} onClick={exportScl} title="Download this tuning as .scl">Export</LitButton>
        <input ref={fileRef} type="file" accept=".scl,text/plain" className="hidden" onChange={(e) => void onFile(e)} />
        <RawKnob label="A4" value={tuning.refHz} min={415} max={466} defaultValue={DEFAULT_REF_HZ} color={ACCENTS[5]}
          onChange={(v) => perf.update("tuning", { refHz: v })} format={(v) => `${v.toFixed(1)}Hz`} />
      </div>
      <div className="mt-0.5 truncate text-[8px] text-zinc-400" title={t.description}>
        {t.cents.length} notes / period {t.cents[t.cents.length - 1].toFixed(1)}¢ · {t.description}
      </div>
      {error ? <div className="text-[8px] text-red-400">{error}</div> : null}
      <div className="mt-1"><DeviationPlot tuning={t} /></div>
      <Label className="normal-case">each key = one scale step from middle C · deviation from nearest 12-TET semitone</Label>
    </Section>
  );
}
