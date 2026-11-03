"use client";

// INSANITY — shared chrome: the section frame and the small chunky buttons.
// Look: near-black panels, 1px zinc borders, tiny uppercase titles with a dot,
// like the reference screenshot.

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Set by the mobile layout. When present, every <Section> becomes a tab that can be
 * closed (collapsed to its title bar) and reopened. Desktop provides nothing, so the
 * desktop board renders exactly as before.
 */
export interface SectionCollapse {
  isOpen(title: string): boolean;
  toggle(title: string): void;
}
export const SectionCollapseContext = createContext<SectionCollapse | null>(null);

/** Stable DOM id for a section, used by the mobile jump bar. */
export function sectionDomId(title: string): string {
  return `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function Section({ title, badge, children, className, bodyClassName }: {
  title: string;
  /** e.g. "(32x)" shown dimmer after the title. */
  badge?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}): JSX.Element {
  const collapse = useContext(SectionCollapseContext);
  if (collapse) {
    const open = collapse.isOpen(title);
    return (
      <section
        id={sectionDomId(title)}
        className="flex min-w-0 scroll-mt-12 flex-col rounded-[3px] border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        <h2 className={cn("flex items-center text-[11px] font-bold uppercase tracking-wider text-zinc-200", open && "border-b border-zinc-800")}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => collapse.toggle(title)}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 px-2 text-left"
          >
            <span className="w-3 text-zinc-500">{open ? "▾" : "▸"}</span>
            <span className="truncate">{title}</span>
            {badge ? <span className="font-normal text-zinc-500">{badge}</span> : null}
          </button>
          {open ? (
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={() => collapse.toggle(title)}
              className="grid h-10 w-10 shrink-0 place-items-center text-base text-zinc-500 hover:text-white"
            >
              ✕
            </button>
          ) : null}
        </h2>
        {/* Dense desktop grids scroll sideways inside the section instead of widening the page. */}
        {open ? <div className={cn("min-w-0 overflow-x-auto p-1", bodyClassName)}>{children}</div> : null}
      </section>
    );
  }
  return (
    <section className={cn("flex min-w-0 flex-col rounded-[3px] border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", className)}>
      <h2 className="flex items-center gap-1 border-b border-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-200">
        <span className="text-zinc-500">▪</span>
        {title}
        {badge ? <span className="font-normal text-zinc-500">{badge}</span> : null}
      </h2>
      <div className={cn("min-w-0 flex-1 p-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function ChunkyButton({ children, onClick, danger, active, className, title }: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  className?: string;
  title?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[3px] border px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors",
        danger
          ? "border-red-900 bg-gradient-to-b from-red-700 to-red-950 text-red-100 hover:from-red-600"
          : active
            ? "border-violet-500 bg-violet-700 text-white"
            : "border-zinc-700 bg-gradient-to-b from-zinc-700 to-zinc-900 text-zinc-200 hover:from-zinc-600",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A vertical LED-style meter, 0..1. */
export function MeterBar({ value, className, color }: { value: number; className?: string; color?: string }): JSX.Element {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative w-2 overflow-hidden rounded-[1px] bg-zinc-900", className)}>
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: `${v * 100}%`, background: color ?? "linear-gradient(to top, #22c55e 0%, #22c55e 60%, #eab308 80%, #ef4444 100%)" }}
      />
    </div>
  );
}
