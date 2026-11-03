"use client";

// INSANITY — the instrument-layer panels and the headless LayerManager.
//   PhysicalModelingPanel  Braids (with model selector) + Breezaphone
//   SpectralPanel          Exciton + a live spectrum of the master output
//   AtmospherePanel        Pollen
// Layer audio lives in src/lib/insanity/layers/; these panels only bind params and
// show the load status ("LOAD FAILED" when a worklet can't load).

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BRAIDS_C_LABEL, BRAIDS_D_LABEL, BRAIDS_MODELS, type BraidsModelId } from "@/lib/insanity/layers/braidsLayer";
import { getLayerManager } from "@/lib/insanity/layers/manager";
import { LAYER_CONTROL_LABELS, type LayerStatus } from "@/lib/insanity/layers/types";
import type { LayerId } from "@/lib/insanity/params";
import { useInsanityHost } from "../InsanityContext";
import { ACCENTS, ParamKnob, ParamToggle } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";

/** Headless: mounts the layer manager (param watchers + note listener). */
export function LayerManager(): null {
  const host = useInsanityHost();
  useEffect(() => getLayerManager(host).attach(), [host]);
  return null;
}

function useLayerManager() {
  const host = useInsanityHost();
  const m = getLayerManager(host);
  // Re-render on any status / model change.
  useSyncExternalStore(m.subscribe, () => `${m.status("braids")}|${m.status("breezaphone")}|${m.status("pollen")}|${m.status("exciton")}|${m.getBraidsModel()}`, () => "");
  return m;
}

const STATUS_TEXT: Record<LayerStatus, string> = {
  off: "OFF",
  standby: "PRESS START",
  loading: "LOADING…",
  on: "LIVE",
  failed: "LOAD FAILED",
};

function StatusBadge({ status, error, onRetry }: { status: LayerStatus; error: string | null; onRetry: () => void }): JSX.Element {
  return (
    <button
      type="button"
      disabled={status !== "failed"}
      onClick={onRetry}
      title={status === "failed" ? `${error ?? "Unknown error"} (click to retry)` : STATUS_TEXT[status]}
      className={cn(
        "rounded-[2px] px-1 font-mono text-[7px] font-bold leading-tight",
        status === "on" && "bg-emerald-500/20 text-emerald-300",
        status === "loading" && "animate-pulse bg-amber-500/20 text-amber-300",
        status === "failed" && "cursor-pointer bg-red-600/30 text-red-300",
        (status === "off" || status === "standby") && "text-zinc-500",
      )}
    >
      {STATUS_TEXT[status]}
    </button>
  );
}

function LayerStrip({ id, title, labels, color, children }: {
  id: LayerId;
  title: string;
  labels: readonly [string, string, string, string];
  color: string;
  children?: ReactNode;
}): JSX.Element {
  const m = useLayerManager();
  const status = m.status(id);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[2px] border border-zinc-800/80 bg-black/40 p-1">
      <div className="flex items-center gap-1">
        <ParamToggle id={`layer.${id}.on`} label="ON" color={color} />
        <span className="truncate text-[8px] font-bold uppercase tracking-wide text-zinc-300">{title}</span>
        <span className="flex-1" />
        <StatusBadge status={status} error={m.error(id)} onRetry={() => m.retry(id)} />
      </div>
      {children}
      <div className="flex flex-wrap items-start justify-center gap-0.5">
        <ParamKnob id={`layer.${id}.level`} label="Level" color={color} />
        <ParamKnob id={`layer.${id}.a`} label={labels[0]} color={color} />
        <ParamKnob id={`layer.${id}.b`} label={labels[1]} color={color} />
        <ParamKnob id={`layer.${id}.c`} label={labels[2]} color={color} />
        <ParamKnob id={`layer.${id}.d`} label={labels[3]} color={color} />
      </div>
    </div>
  );
}

function BraidsModelSelect(): JSX.Element {
  const m = useLayerManager();
  return (
    <select
      title="Braids model"
      value={m.getBraidsModel()}
      onChange={(e) => m.setBraidsModel(e.target.value as BraidsModelId)}
      className="h-4 rounded-[2px] border border-zinc-700 bg-zinc-900 px-0.5 text-[8px] uppercase text-zinc-300"
    >
      {BRAIDS_MODELS.map((x) => (
        <option key={x.id} value={x.id}>{x.label}</option>
      ))}
    </select>
  );
}

export function PhysicalModelingPanel(): JSX.Element {
  const m = useLayerManager();
  const model = BRAIDS_MODELS.find((x) => x.id === m.getBraidsModel()) ?? BRAIDS_MODELS[0];
  return (
    <Section title="PHYSICAL MODELING" badge="(2 real instruments)" className="h-full" bodyClassName="grid grid-cols-2 gap-1">
      <LayerStrip id="braids" title="Braids" labels={[model.a, model.b, BRAIDS_C_LABEL, BRAIDS_D_LABEL]} color={ACCENTS[2]}>
        <BraidsModelSelect />
      </LayerStrip>
      <LayerStrip id="breezaphone" title="Breezaphone" labels={LAYER_CONTROL_LABELS.breezaphone} color={ACCENTS[1]} />
    </Section>
  );
}

export function AtmospherePanel(): JSX.Element {
  return (
    <Section title="ATMOSPHERE GENERATOR" badge="(granular)" className="h-full">
      <LayerStrip id="pollen" title="Pollen" labels={LAYER_CONTROL_LABELS.pollen} color={ACCENTS[3]}>
        <p className="text-[7px] leading-tight text-zinc-500">Mono granular pad: chords play the newest note.</p>
      </LayerStrip>
    </Section>
  );
}

// ---- spectrum --------------------------------------------------------------

const FFT_N = 128;
const HANN = Float32Array.from({ length: FFT_N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1)));
const BITREV = (() => {
  const r = new Uint16Array(FFT_N);
  const bits = Math.log2(FFT_N);
  for (let i = 0; i < FFT_N; i++) {
    let x = i, y = 0;
    for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; }
    r[i] = y;
  }
  return r;
})();

/** In-place radix-2 FFT of a real 128-sample frame; writes magnitudes (dB) to out[0..63]. */
function spectrum(input: Float32Array, re: Float32Array, im: Float32Array, out: Float32Array): void {
  for (let i = 0; i < FFT_N; i++) {
    re[BITREV[i]] = (input[i] ?? 0) * HANN[i];
    im[BITREV[i]] = 0;
  }
  for (let size = 2; size <= FFT_N; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < FFT_N; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(step * k), wi = Math.sin(step * k);
        const a = start + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
  for (let k = 0; k < FFT_N / 2; k++) {
    const mag = Math.hypot(re[k], im[k]) / (FFT_N / 4);
    out[k] = 20 * Math.log10(mag + 1e-6);
  }
}

function SpectrumCanvas(): JSX.Element {
  const host = useInsanityHost();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const re = new Float32Array(FFT_N), im = new Float32Array(FFT_N);
    const db = new Float32Array(FFT_N / 2);
    const smooth = new Float32Array(FFT_N / 2).fill(-90);
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.fillStyle = "#050507";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#18181b";
      for (let g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(0, (h * g) / 4); ctx.lineTo(w, (h * g) / 4); ctx.stroke(); }
      const scope = host.lastMeters?.scope;
      if (scope && scope.length >= FFT_N) spectrum(scope, re, im, db);
      else db.fill(-90);
      const bins = FFT_N / 2;
      const bw = w / (bins - 1);
      for (let k = 1; k < bins; k++) {
        smooth[k] = db[k] > smooth[k] ? db[k] : smooth[k] * 0.85 + db[k] * 0.15;
        const norm = Math.max(0, Math.min(1, (smooth[k] + 72) / 72));
        const bh = norm * h;
        ctx.fillStyle = `hsl(${280 - (k / bins) * 200}, 85%, ${45 + norm * 20}%)`;
        ctx.fillRect((k - 1) * bw, h - bh, Math.max(1, bw - 1), bh);
      }
      // scope trace on top
      if (scope && scope.length > 1) {
        ctx.strokeStyle = "rgba(34,211,238,0.6)";
        ctx.beginPath();
        for (let i = 0; i < scope.length; i++) {
          const x = (i / (scope.length - 1)) * w;
          const y = h / 2 - scope[i] * h * 0.45;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [host]);
  return <canvas ref={ref} aria-label="Output spectrum" className="h-16 w-full rounded-[2px] border border-zinc-800" />;
}

export function SpectralPanel(): JSX.Element {
  return (
    <Section title="SPECTRAL STUFF" badge="(FFT, allegedly)" className="h-full" bodyClassName="flex flex-col gap-1">
      <SpectrumCanvas />
      <LayerStrip id="exciton" title="Exciton" labels={LAYER_CONTROL_LABELS.exciton} color={ACCENTS[4]} />
    </Section>
  );
}
