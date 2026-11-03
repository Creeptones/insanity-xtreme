"use client";

// INSANITY — ONE PAGER. The stripped-down face of the synth: the controls that matter
// most, on one screen, with room to breathe. Same engine and params as the full board,
// so switching views never changes the sound.
//
// Desktop (>= 1024px): a single viewport, no page scroll. Three columns (sound sources /
// hero scope + filter / shape + effects + master) over a full-width keyboard.
// Phones: the same cards stacked, keyboard pinned to the bottom.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { cn } from "@/lib/cn";
import { PARAMS, formatParam, fromNorm, paramIndex, toNorm, type ParamGroup } from "@/lib/insanity/params";
import { randomize } from "@/lib/insanity/randomize";
import { ARP_MODES, type ArpMode } from "@/lib/insanity/perf/theory";
import { useInsanityHost, useParam, useParamIndex } from "./InsanityContext";
import { KeyboardPanel, InputStatus, usePerf } from "./perf";
import { usePerfSettings } from "./perf/PerformanceContext";
import { LayerManager } from "./content";
import { useSession } from "./content/session";
import { fitCanvas, useFrame } from "./panels/frame";
import { useViewMode } from "./ViewMode";

// ---- palette -----------------------------------------------------------------
const C = {
  violet: "#a78bfa",
  cyan: "#22d3ee",
  pink: "#f472b6",
  amber: "#fbbf24",
  green: "#4ade80",
  red: "#f87171",
} as const;

// ---- the knob ------------------------------------------------------------------
const ARC_START = -135;
const ARC_SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

interface DialProps {
  norm: number;
  origin?: number;
  display: string;
  label: string;
  color: string;
  size?: number;
  onNorm: (n: number) => void;
  onReset: () => void;
}

/** A large, glowing dial. Drag up/down (Shift = fine), wheel, arrows, double-click resets. */
const Dial = memo(function Dial({ norm, origin = 0, display, label, color, size = 58, onNorm, onReset }: DialProps) {
  const drag = useRef<{ y: number; n: number } | null>(null);
  const onDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, n: norm };
  }, [norm]);
  const onMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    onNorm(Math.min(1, Math.max(0, d.n + (d.y - e.clientY) / (e.shiftKey ? 900 : 220))));
  }, [onNorm]);
  const onUp = useCallback(() => { drag.current = null; }, []);
  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    onNorm(Math.min(1, Math.max(0, norm - Math.sign(e.deltaY) * (e.shiftKey ? 0.004 : 0.025))));
  }, [norm, onNorm]);
  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.002 : 0.02;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { onNorm(Math.min(1, norm + step)); e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { onNorm(Math.max(0, norm - step)); e.preventDefault(); }
  }, [norm, onNorm]);

  const s = size;
  const c = s / 2;
  const r = s / 2 - 5;
  const aVal = ARC_START + norm * ARC_SWEEP;
  const aOrg = ARC_START + origin * ARC_SWEEP;
  const [px, py] = polar(c, c, r - 9, aVal);
  const gid = `g${label.replace(/\W/g, "")}${Math.round(s)}`;
  return (
    <div className="flex select-none flex-col items-center gap-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={display}
        aria-valuenow={Math.round(norm * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        title={`${label}: ${display}`}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onReset}
        onWheel={onWheel}
        onKeyDown={onKey}
      >
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <defs>
            <radialGradient id={`${gid}b`} cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="100%" stopColor="#0c0c0f" />
            </radialGradient>
          </defs>
          <path d={arcPath(c, c, r, ARC_START, ARC_START + ARC_SWEEP)} stroke="rgba(255,255,255,0.08)" strokeWidth={4} fill="none" strokeLinecap="round" />
          {Math.abs(aVal - aOrg) > 0.5 ? (
            <path
              d={arcPath(c, c, r, Math.min(aVal, aOrg), Math.max(aVal, aOrg))}
              stroke={color}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
          ) : null}
          <circle cx={c} cy={c} r={r - 7} fill={`url(#${gid}b)`} stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
          <line x1={c} y1={c} x2={px} y2={py} stroke="#fafafa" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center leading-tight">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</div>
        <div className="font-mono text-[11px] tabular-nums text-zinc-200">{display}</div>
      </div>
    </div>
  );
});

/** A dial bound to one param. */
function Knob({ id, label, color, size }: { id: string; label: string; color: string; size?: number }): JSX.Element {
  const index = paramIndex(id);
  const p = PARAMS[index];
  const [value, set] = useParamIndex(index);
  const onNorm = useCallback((n: number) => set(fromNorm(p, n)), [p, set]);
  const onReset = useCallback(() => set(p.def), [p, set]);
  const bipolar = p.min < 0 && p.max > 0 && p.skew === "lin";
  return (
    <Dial
      norm={toNorm(p, value)}
      origin={bipolar ? toNorm(p, 0) : 0}
      display={formatParam(p, value)}
      label={label}
      color={color}
      size={size}
      onNorm={onNorm}
      onReset={onReset}
    />
  );
}

/** DRIVE: one knob that sets both the drive amount and switches its mix in. */
function DriveKnob({ color }: { color: string }): JSX.Element {
  const host = useInsanityHost();
  const [db] = useParam("fx.drive.db");
  const n = db / 24;
  const onNorm = useCallback((v: number) => {
    host.setById("fx.drive.db", v * 24);
    host.setById("fx.drive.mix", v > 0.005 ? 1 : 0);
  }, [host]);
  const onReset = useCallback(() => onNorm(0), [onNorm]);
  return <Dial norm={n} display={`${db.toFixed(1)}dB`} label="Drive" color={color} onNorm={onNorm} onReset={onReset} />;
}

// ---- chips ---------------------------------------------------------------------
function Chips<T extends string | number>({ options, value, onPick, color, label }: {
  options: readonly { v: T; text: string }[];
  value: T;
  onPick: (v: T) => void;
  color: string;
  label: string;
}): JSX.Element {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.v)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition",
              on ? "text-black" : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200",
            )}
            style={on ? { background: color, borderColor: color, boxShadow: `0 0 12px ${color}66` } : undefined}
          >
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

const MODE_TEXT: Record<string, string> = {
  off: "Off", sine: "Sine", tri: "Tri", saw: "Saw", square: "Square", noise: "Noise",
  wavetable: "Wave", fm: "FM", additive: "Add", chaos: "Chaos",
};

function ParamChips({ id, labels, color }: { id: string; labels?: Record<string, string>; color: string }): JSX.Element {
  const index = paramIndex(id);
  const p = PARAMS[index];
  const [value, set] = useParamIndex(index);
  const options = useMemo(() => (p.options ?? []).map((o, i) => ({ v: i, text: labels?.[o] ?? o })), [p, labels]);
  return <Chips options={options} value={Math.round(value)} onPick={set} color={color} label={p.label} />;
}

// ---- card ----------------------------------------------------------------------
function Card({ title, color, right, children, className }: {
  title: string;
  color: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-zinc-200">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

// ---- cards ---------------------------------------------------------------------
const OscCard = memo(function OscCard({ n, color }: { n: 1 | 2; color: string }): JSX.Element {
  const p = `osc${n}`;
  return (
    <Card title={n === 1 ? "Oscillator A" : "Oscillator B"} color={color}>
      <ParamChips id={`${p}.mode`} labels={MODE_TEXT} color={color} />
      <div className="grid grid-cols-3 gap-y-3 lg:grid-cols-6">
        <Knob id={`${p}.level`} label="Level" color={color} size={48} />
        <Knob id={`${p}.shape`} label="Shape" color={color} size={48} />
        <Knob id={`${p}.coarse`} label="Tune" color={color} size={48} />
        <Knob id={`${p}.fine`} label="Fine" color={color} size={48} />
        <Knob id={`${p}.unison`} label="Unison" color={color} size={48} />
        <Knob id={`${p}.detune`} label="Detune" color={color} size={48} />
      </div>
    </Card>
  );
});

const ARP_TEXT: Partial<Record<ArpMode, string>> = { off: "Off", up: "Up", down: "Down", updown: "Up/Dn", random: "Rand" };
const ARP_OPTIONS = ARP_MODES.filter((m) => m in ARP_TEXT).map((m) => ({ v: m, text: ARP_TEXT[m] ?? m }));

const PlayCard = memo(function PlayCard(): JSX.Element {
  const perf = usePerf();
  const s = usePerfSettings();
  return (
    <Card title="Play" color={C.amber}>
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Arpeggiator</span>
        <Chips options={ARP_OPTIONS} value={s.arp.mode} onPick={(mode) => perf.update("arp", { mode })} color={C.amber} label="Arpeggiator" />
      </div>
      <div className="grid grid-cols-3">
        <Knob id="voice.glide" label="Glide" color={C.amber} />
        <Knob id="global.tempo" label="Tempo" color={C.amber} />
        <Knob id="voice.bendRange" label="Bend" color={C.amber} />
      </div>
    </Card>
  );
});

/** Live output scope with a glow, drawn straight from the meter reports (no React re-render). */
const HeroScope = memo(function HeroScope(): JSX.Element {
  const host = useInsanityHost();
  const ref = useRef<HTMLCanvasElement>(null);
  useFrame(() => {
    const fit = fitCanvas(ref.current);
    if (!fit) return;
    const { g, w, h } = fit;
    g.clearRect(0, 0, w, h);
    // grid
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const x = (w * i) / 8; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    const scope = host.lastMeters?.scope;
    if (!scope || scope.length === 0) return;
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, C.cyan);
    grad.addColorStop(0.5, C.violet);
    grad.addColorStop(1, C.pink);
    g.strokeStyle = grad;
    g.lineWidth = 2.5;
    g.shadowColor = C.violet;
    g.shadowBlur = 14;
    g.beginPath();
    for (let i = 0; i < scope.length; i++) {
      const x = (i / (scope.length - 1)) * w;
      const y = h / 2 - Math.max(-1, Math.min(1, scope[i] * 1.6)) * (h * 0.44);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.shadowBlur = 0;
  });
  return <canvas ref={ref} className="h-full w-full" aria-label="Output waveform" role="img" />;
});

/** Drag to set filter cutoff (x) and resonance (y). */
const FilterPad = memo(function FilterPad(): JSX.Element {
  const ci = paramIndex("vf1.cutoff");
  const ri = paramIndex("vf1.reso");
  const [cut, setCut] = useParamIndex(ci);
  const [res, setRes] = useParamIndex(ri);
  const x = toNorm(PARAMS[ci], cut);
  const y = toNorm(PARAMS[ri], res);
  const ref = useRef<HTMLDivElement>(null);
  const setFrom = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setCut(fromNorm(PARAMS[ci], Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))));
    setRes(fromNorm(PARAMS[ri], Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))));
  }, [ci, ri, setCut, setRes]);
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Filter pad: cutoff left to right, resonance bottom to top"
      className="relative aspect-square w-full max-w-[260px] cursor-crosshair touch-none overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(167,139,250,0.25),transparent_60%),radial-gradient(circle_at_80%_90%,rgba(34,211,238,0.18),transparent_60%)]"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFrom(e); }}
      onPointerMove={(e) => { if (e.buttons) setFrom(e); }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:25%_25%]" />
      <div className="absolute h-px w-full bg-white/15" style={{ top: `${(1 - y) * 100}%` }} />
      <div className="absolute h-full w-px bg-white/15" style={{ left: `${x * 100}%` }} />
      <div
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%`, boxShadow: `0 0 16px 4px ${C.violet}` }}
      />
      <span className="absolute bottom-1.5 left-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Cutoff →</span>
      <span className="absolute left-2 top-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">↑ Reso</span>
    </div>
  );
});

const FILTER_TEXT: Record<string, string> = { lp: "Low pass", hp: "High pass", bp: "Band pass", notch: "Notch" };

const FilterCard = memo(function FilterCard(): JSX.Element {
  return (
    <Card title="Filter" color={C.violet} className="flex-1">
      <ParamChips id="vf1.type" labels={FILTER_TEXT} color={C.violet} />
      <div className="grid min-h-0 flex-1 grid-cols-1 items-center gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Knob id="vf1.cutoff" label="Cutoff" color={C.violet} size={104} />
          <div className="grid grid-cols-3 gap-x-2">
            <Knob id="vf1.reso" label="Reso" color={C.violet} size={50} />
            <Knob id="vf1.envAmt" label="Env" color={C.violet} size={50} />
            <Knob id="vf1.drive" label="Drive" color={C.violet} size={50} />
          </div>
        </div>
        <div className="flex justify-center">
          <FilterPad />
        </div>
      </div>
    </Card>
  );
});

/** The amp envelope drawn from its four params. */
const EnvShape = memo(function EnvShape({ color }: { color: string }): JSX.Element {
  const [a] = useParam("amp.attack");
  const [d] = useParam("amp.decay");
  const [s] = useParam("amp.sustain");
  const [r] = useParam("amp.release");
  const ta = toNorm(PARAMS[paramIndex("amp.attack")], a);
  const td = toNorm(PARAMS[paramIndex("amp.decay")], d);
  const tr = toNorm(PARAMS[paramIndex("amp.release")], r);
  const W = 240;
  const H = 70;
  const seg = W / 4.2;
  const x1 = 4 + ta * seg;
  const x2 = x1 + td * seg;
  const x3 = x2 + seg * 0.9;
  const x4 = x3 + tr * seg;
  const ys = 6 + (1 - s) * (H - 12);
  const path = `M4 ${H - 6} L${x1} 6 L${x2} ${ys} L${x3} ${ys} L${x4} ${H - 6}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id="envfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} Z`} fill="url(#envfill)" />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
});

const EnvCard = memo(function EnvCard(): JSX.Element {
  return (
    <Card title="Shape" color={C.green}>
      <EnvShape color={C.green} />
      <div className="grid grid-cols-4">
        <Knob id="amp.attack" label="Attack" color={C.green} size={50} />
        <Knob id="amp.decay" label="Decay" color={C.green} size={50} />
        <Knob id="amp.sustain" label="Sustain" color={C.green} size={50} />
        <Knob id="amp.release" label="Release" color={C.green} size={50} />
      </div>
    </Card>
  );
});

const FxCard = memo(function FxCard(): JSX.Element {
  return (
    <Card title="Effects" color={C.pink}>
      <div className="grid grid-cols-4 gap-y-3">
        <DriveKnob color={C.pink} />
        <Knob id="fx.chorus.mix" label="Chorus" color={C.pink} size={50} />
        <Knob id="fx.phaser.mix" label="Phaser" color={C.pink} size={50} />
        <Knob id="fx.crush.mix" label="Crush" color={C.pink} size={50} />
        <Knob id="fx.delay.mix" label="Echo" color={C.cyan} size={50} />
        <Knob id="fx.delay.time" label="Time" color={C.cyan} size={50} />
        <Knob id="fx.delay.feedback" label="Repeats" color={C.cyan} size={50} />
        <Knob id="fx.reverb.mix" label="Space" color={C.violet} size={50} />
      </div>
    </Card>
  );
});

/** Stereo peak meter, canvas, driven from the meter reports. */
const Meter = memo(function Meter(): JSX.Element {
  const host = useInsanityHost();
  const ref = useRef<HTMLCanvasElement>(null);
  const smooth = useRef([0, 0]);
  useFrame(() => {
    const fit = fitCanvas(ref.current);
    if (!fit) return;
    const { g, w, h } = fit;
    g.clearRect(0, 0, w, h);
    const m = host.lastMeters;
    const vals = [m?.peakL ?? 0, m?.peakR ?? 0];
    const bw = (w - 4) / 2;
    vals.forEach((v, i) => {
      const db = v > 0 ? 20 * Math.log10(v) : -60;
      const target = Math.max(0, Math.min(1, (db + 60) / 60));
      smooth.current[i] = Math.max(target, smooth.current[i] * 0.9);
      const lh = smooth.current[i] * h;
      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, C.green);
      grad.addColorStop(0.75, C.amber);
      grad.addColorStop(1, C.red);
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(i * (bw + 4), 0, bw, h);
      g.fillStyle = grad;
      g.fillRect(i * (bw + 4), h - lh, bw, lh);
    });
  });
  return <canvas ref={ref} className="h-full w-5" aria-label="Output level" role="img" />;
});

const MasterCard = memo(function MasterCard(): JSX.Element {
  return (
    <Card title="Master" color={C.cyan}>
      <div className="flex items-center justify-around gap-3">
        <Knob id="fx.reverb.size" label="Room" color={C.violet} size={50} />
        <Knob id="fx.width" label="Width" color={C.cyan} size={50} />
        <Knob id="master.volume" label="Output" color={C.cyan} size={74} />
        <div className="h-24"><Meter /></div>
      </div>
    </Card>
  );
});

// ---- header --------------------------------------------------------------------
const ONE_PAGER_GROUPS: ReadonlySet<ParamGroup> = new Set<ParamGroup>(["osc", "voice", "fx"]);
let rollCount = 0;

const Header = memo(function Header(): JSX.Element {
  const host = useInsanityHost();
  const [state, session] = useSession();
  const { setView } = useViewMode();
  const [destroy, setDestroy] = useParam("global.destroyCpu");
  const destroyOn = destroy >= 0.5;
  const onRoll = useCallback(() => {
    rollCount++;
    session.apply(randomize(host.values, ONE_PAGER_GROUPS, 0.5), `ROLL #${rollCount}`);
  }, [host, session]);
  return (
    <header className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-700 text-lg font-black text-white shadow-[0_0_20px_rgba(167,139,250,0.55)]">∞</div>
        <div className="leading-none">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-white">Insanity</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-violet-300">One Pager</div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-white/10 bg-black/30 px-1 py-1 max-lg:basis-full">
        <button type="button" aria-label="Previous preset" onClick={() => session.step(-1)} className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">◀</button>
        <div className="min-w-0 flex-1 text-center" aria-live="polite">
          <div className="truncate font-mono text-xs font-bold uppercase tracking-wider text-amber-200">{state.presetName}</div>
          {state.message ? <div className="truncate text-[10px] text-zinc-400">{state.message}</div> : null}
        </div>
        <button type="button" aria-label="Next preset" onClick={() => session.step(1)} className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">▶</button>
      </div>

      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <button type="button" onClick={onRoll} className="rounded-full border border-white/15 px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-zinc-100 hover:border-white/40">
          🎲 Roll
        </button>
        <button
          type="button"
          aria-pressed={destroyOn}
          onClick={() => setDestroy(destroyOn ? 0 : 1)}
          title="Forces 8-voice unison on every oscillator"
          className={cn(
            "rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-wider",
            destroyOn ? "animate-pulse border-red-400 bg-red-600 text-white shadow-[0_0_18px_rgba(248,113,113,0.7)]" : "border-red-500/50 text-red-300 hover:bg-red-950/50",
          )}
        >
          {destroyOn ? "CPU destroyed" : "Destroy CPU"}
        </button>
        <div className="min-w-0 max-w-full overflow-hidden">
          <InputStatus inline />
        </div>
        <button
          type="button"
          onClick={() => setView("insane")}
          className="rounded-full bg-gradient-to-r from-red-600 to-fuchsia-600 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white shadow-[0_0_18px_rgba(217,70,239,0.45)] hover:brightness-110"
          title="Back to all 799 controls"
        >
          Full Insanity →
        </button>
      </div>
    </header>
  );
});

// ---- page ----------------------------------------------------------------------
/** The desktop layout is designed for this much height; shorter windows get it scaled down to fit. */
const DESIGN_HEIGHT = 1000;

/** Scale factor (<= 1) that fits the design height into the window. 1 on tall screens and phones. */
function useFitScale(enabled: boolean): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!enabled) {
      setScale(1);
      return;
    }
    const fit = (): void => setScale(Math.min(1, window.innerHeight / DESIGN_HEIGHT));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [enabled]);
  return scale;
}

export function OnePager({ mobile }: { mobile: boolean }): JSX.Element {
  const scale = useFitScale(!mobile);
  if (mobile || scale >= 1) return <OnePagerBody mobile={mobile} scaled={false} />;
  // Lay out at the design height, then scale the whole page down so nothing clips.
  return (
    <div className="h-screen w-full overflow-hidden">
      <div style={{ width: `${100 / scale}vw`, height: `${100 / scale}vh`, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <OnePagerBody mobile={false} scaled />
      </div>
    </div>
  );
}

function OnePagerBody({ mobile, scaled }: { mobile: boolean; scaled: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        "relative bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(8,145,178,0.18),transparent_55%)]",
        mobile ? "min-h-screen pb-56" : cn("flex flex-col overflow-hidden", scaled ? "h-full" : "h-screen"),
      )}
    >
      <LayerManager />
      <div className={cn("flex min-h-0 flex-col gap-3 p-3", !mobile && "flex-1 p-4")}>
        <Header />
        <div className={cn("grid gap-3", mobile ? "grid-cols-1" : "min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]")}>
          <div className="flex min-h-0 flex-col gap-3">
            <OscCard n={1} color={C.cyan} />
            <OscCard n={2} color={C.pink} />
            <PlayCard />
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            <div className={cn("relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40", mobile ? "h-32" : "h-[22%] min-h-28")}>
              <HeroScope />
            </div>
            <FilterCard />
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            <EnvCard />
            <FxCard />
            <MasterCard />
          </div>
        </div>
      </div>
      {/* Keyboard: a strip along the bottom on desktop, pinned on phones. */}
      <div
        className={cn(
          "border-t border-white/10 bg-black/60 backdrop-blur",
          mobile ? "fixed inset-x-0 bottom-0 z-40 max-h-[45vh] overflow-y-auto" : "shrink-0 px-4 pb-3 pt-2",
        )}
      >
        <KeyboardPanel />
      </div>
    </div>
  );
}

