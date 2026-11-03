"use client";

// INSANITY — knobs and small controls. Hundreds render at once, so they are
// memoised, tooltip-free (native `title` only) and drawn as one tiny SVG each.
//
//   <ParamKnob id="osc1.level" />            bound to the param store (label from PARAMS)
//   <RawKnob value min max onChange label /> unbound (for main-thread-only state)
//   <ParamToggle id="bank1.on" />            bool param as a lit square button
//   <ParamSelect id="osc1.mode" />           enum param as a tiny select
//
// Interaction: vertical drag (200px = full range, Shift = fine 800px), wheel,
// double-click resets, keyboard arrows. Log params drag in normalised space.

import { createContext, memo, useCallback, useContext, useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { cn } from "@/lib/cn";
import { PARAMS, formatParam, fromNorm, paramIndex, toNorm, type ParamSpec } from "@/lib/insanity/params";
import { useParamIndex } from "./InsanityContext";

/** Multiplies every knob's size. The mobile layout sets it above 1 so knobs are big enough for fingers. */
export const KnobScaleContext = createContext(1);

const ARC_START = -135;
const ARC_SWEEP = 270;

/** Accent colours cycled per section, like the reference screenshot. */
export const ACCENTS = ["#a855f7", "#22d3ee", "#f59e0b", "#4ade80", "#f472b6", "#60a5fa", "#ef4444", "#facc15"] as const;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

interface DialProps {
  norm: number;
  /** Normalised value the arc fills from (0.5 for bipolar params). */
  origin: number;
  size: number;
  color: string;
  label?: string;
  display: string;
  title: string;
  onNorm: (n: number) => void;
  onReset: () => void;
}

const Dial = memo(function Dial({ norm, origin, size: baseSize, color, label, display, title, onNorm, onReset }: DialProps) {
  const size = Math.round(baseSize * useContext(KnobScaleContext));
  const drag = useRef<{ y: number; n: number } | null>(null);
  const onDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, n: norm };
  }, [norm]);
  const onMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const range = e.shiftKey ? 800 : 200;
    onNorm(Math.min(1, Math.max(0, d.n + (d.y - e.clientY) / range)));
  }, [onNorm]);
  const onUp = useCallback(() => { drag.current = null; }, []);
  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    onNorm(Math.min(1, Math.max(0, norm - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.03))));
  }, [norm, onNorm]);
  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.002 : 0.02;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { onNorm(Math.min(1, norm + step)); e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { onNorm(Math.max(0, norm - step)); e.preventDefault(); }
    else if (e.key === "Home") onNorm(0);
    else if (e.key === "End") onNorm(1);
  }, [norm, onNorm]);

  const s = size;
  const c = s / 2;
  const r = s / 2 - 3;
  const aVal = ARC_START + norm * ARC_SWEEP;
  const aOrg = ARC_START + origin * ARC_SWEEP;
  const [px, py] = polar(c, c, r - 4, aVal);
  return (
    <div className="flex flex-col items-center select-none" style={{ width: s + 8 }}>
      {label ? <div className="w-full truncate text-center text-[8px] uppercase leading-tight tracking-wide text-zinc-400">{label}</div> : null}
      <div
        role="slider"
        tabIndex={0}
        aria-label={title}
        aria-valuetext={display}
        aria-valuenow={Math.round(norm * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        title={`${title}: ${display}`}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-1 focus-visible:ring-white/50"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onReset}
        onWheel={onWheel}
        onKeyDown={onKey}
      >
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
          <circle cx={c} cy={c} r={r - 2} fill="#18181b" stroke="#000" strokeWidth={1} />
          <path d={arc(c, c, r, ARC_START, ARC_START + ARC_SWEEP)} stroke="#3f3f46" strokeWidth={2} fill="none" strokeLinecap="round" />
          {Math.abs(aVal - aOrg) > 0.5 ? (
            <path d={arc(c, c, r, Math.min(aVal, aOrg), Math.max(aVal, aOrg))} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
          ) : null}
          <line x1={c} y1={c} x2={px} y2={py} stroke="#e4e4e7" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </div>
      <div className="w-full truncate text-center font-mono text-[8px] leading-tight text-zinc-500">{display}</div>
    </div>
  );
});

export interface ParamKnobProps {
  id: string;
  /** Override the label (defaults to the param label with the group prefix trimmed). */
  label?: string;
  size?: number;
  color?: string;
  hideLabel?: boolean;
}

function shortLabel(p: ParamSpec): string {
  // "OSC 3 Coarse" → "Coarse"; "Filter Bank Mix" stays.
  return p.label.replace(/^(OSC|FLT|LFO|ENV|FUNC|Mod|XY|Filter) \d+ /, "").replace(/^Macro (\d+)$/, "M$1");
}

export const ParamKnob = memo(function ParamKnob({ id, label, size = 26, color = ACCENTS[0], hideLabel }: ParamKnobProps) {
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
      size={size}
      color={color}
      label={hideLabel ? undefined : label ?? shortLabel(p)}
      display={formatParam(p, value)}
      title={p.label}
      onNorm={onNorm}
      onReset={onReset}
    />
  );
});

export interface RawKnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label?: string;
  defaultValue?: number;
  size?: number;
  color?: string;
  /** Round to integers. */
  integer?: boolean;
  format?: (v: number) => string;
}

export const RawKnob = memo(function RawKnob({ value, min, max, onChange, label, defaultValue, size = 26, color = ACCENTS[1], integer, format }: RawKnobProps) {
  const norm = max === min ? 0 : (value - min) / (max - min);
  const onNorm = useCallback((n: number) => {
    const v = min + n * (max - min);
    onChange(integer ? Math.round(v) : v);
  }, [min, max, integer, onChange]);
  const onReset = useCallback(() => onChange(defaultValue ?? (integer ? Math.round((min + max) / 2) : (min + max) / 2)), [defaultValue, integer, min, max, onChange]);
  const display = format ? format(value) : integer ? String(Math.round(value)) : value.toFixed(2);
  return (
    <Dial norm={norm} origin={min < 0 && max > 0 ? -min / (max - min) : 0} size={size} color={color} label={label} display={display} title={label ?? ""} onNorm={onNorm} onReset={onReset} />
  );
});

export const ParamToggle = memo(function ParamToggle({ id, label, color = ACCENTS[3], className }: { id: string; label?: string; color?: string; className?: string }) {
  const index = paramIndex(id);
  const [value, set] = useParamIndex(index);
  const on = value >= 0.5;
  return (
    <button
      type="button"
      title={PARAMS[index].label}
      aria-pressed={on}
      onClick={() => set(on ? 0 : 1)}
      className={cn("h-3 min-w-3 rounded-[2px] border border-black px-0.5 text-[7px] font-bold uppercase leading-none", on ? "text-black" : "bg-zinc-800 text-zinc-500", className)}
      style={on ? { background: color, boxShadow: `0 0 6px ${color}` } : undefined}
    >
      {label ?? ""}
    </button>
  );
});

export const ParamSelect = memo(function ParamSelect({ id, className }: { id: string; className?: string }) {
  const index = paramIndex(id);
  const p = PARAMS[index];
  const [value, set] = useParamIndex(index);
  return (
    <select
      title={p.label}
      value={Math.round(value)}
      onChange={(e) => set(Number(e.target.value))}
      className={cn("h-4 rounded-[2px] border border-zinc-700 bg-zinc-900 px-0.5 text-[8px] uppercase text-zinc-300", className)}
    >
      {(p.options ?? []).map((o, i) => (
        <option key={o} value={i}>{o}</option>
      ))}
    </select>
  );
});
