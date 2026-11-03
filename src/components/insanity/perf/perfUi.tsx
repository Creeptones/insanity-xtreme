"use client";

// INSANITY perf — tiny shared controls (labelled select, lit toggle, mini piano).

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Label({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <span className={cn("text-[8px] uppercase leading-none tracking-wide text-zinc-500", className)}>{children}</span>;
}

export function MiniSelect<T extends string | number>({ label, value, options, onChange, format, className }: {
  label?: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
  className?: string;
}): JSX.Element {
  return (
    <label className={cn("flex flex-col gap-0.5", className)}>
      {label ? <Label>{label}</Label> : null}
      <select
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o) === e.target.value);
          if (hit !== undefined) onChange(hit);
        }}
        className="h-4 rounded-[2px] border border-zinc-700 bg-zinc-900 px-0.5 text-[8px] uppercase text-zinc-300"
      >
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>{format ? format(o) : String(o)}</option>
        ))}
      </select>
    </label>
  );
}

export function LitButton({ on, onClick, children, title, color = "#4ade80", className }: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  color?: string;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-[2px] border border-black px-1 py-0.5 text-[8px] font-bold uppercase leading-none", on ? "text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700", className)}
      style={on ? { background: color, boxShadow: `0 0 6px ${color}` } : undefined}
    >
      {children}
    </button>
  );
}

const BLACK = new Set([1, 3, 6, 8, 10]);
export function isBlack(n: number): boolean {
  return BLACK.has(((n % 12) + 12) % 12);
}

/** Static one-octave piano strip; `lit(pc)` decides the colour of pitch class pc (0 = C). */
export function MiniPiano({ lit, className, onKey }: { lit: (pc: number) => string | null; className?: string; onKey?: (pc: number) => void }): JSX.Element {
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const blacks: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
  return (
    <div className={cn("relative h-8 w-full select-none", className)}>
      <div className="flex h-full">
        {whites.map((pc) => {
          const c = lit(pc);
          return (
            <button type="button" key={pc} onClick={() => onKey?.(pc)} aria-label={`pitch class ${pc}`}
              className="h-full flex-1 rounded-b-[2px] border border-zinc-700" style={{ background: c ?? "#d4d4d8" }} />
          );
        })}
      </div>
      {blacks.map(([pc, after]) => {
        const c = lit(pc);
        return (
          <button type="button" key={pc} onClick={() => onKey?.(pc)} aria-label={`pitch class ${pc}`}
            className="absolute top-0 h-[60%] rounded-b-[2px] border border-black"
            style={{ left: `${((after + 1) / 7) * 100 - 4.5}%`, width: "9%", background: c ?? "#18181b" }} />
        );
      })}
    </div>
  );
}
