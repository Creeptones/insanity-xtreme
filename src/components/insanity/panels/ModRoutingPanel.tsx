"use client";

import { memo, useCallback, useEffect, useRef, type MouseEvent } from "react";
import { MOD_DESTS, MOD_SLOTS, MOD_SOURCES, PARAMS, paramIndex, type ParamGroup } from "@/lib/insanity/params";
import type { MeterReport } from "@/lib/insanity/protocol";
import type { InsanityHost } from "@/lib/insanity/host";
import { ACCENTS } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { useInsanityHost } from "../InsanityContext";
import { fitCanvas, useFrame } from "./frame";

// ---- static geometry tables --------------------------------------------------
const FAMILIES: readonly { label: string; test: (s: string) => boolean; color: string }[] = [
  { label: "LFO", test: (s) => s.startsWith("lfo"), color: ACCENTS[1] },
  { label: "ENV", test: (s) => s.startsWith("env"), color: ACCENTS[0] },
  { label: "FUNC", test: (s) => s.startsWith("func"), color: ACCENTS[2] },
  { label: "MACRO", test: (s) => s.startsWith("macro"), color: ACCENTS[4] },
  { label: "XY", test: (s) => s.startsWith("xy"), color: ACCENTS[5] },
  { label: "VELOCITY", test: (s) => s === "velocity", color: ACCENTS[3] },
  { label: "MODWHEEL", test: (s) => s === "modwheel", color: ACCENTS[3] },
  { label: "AFTERTCH", test: (s) => s === "aftertouch", color: ACCENTS[3] },
  { label: "KEYTRACK", test: (s) => s === "keytrack", color: ACCENTS[3] },
  { label: "CHAOS", test: (s) => s === "chaos", color: ACCENTS[6] },
  { label: "NOTE RND", test: (s) => s === "noteRandom", color: ACCENTS[7] },
  { label: "AMP ENV", test: (s) => s === "ampEnv", color: ACCENTS[0] },
  { label: "FILT ENV", test: (s) => s === "filterEnv", color: ACCENTS[0] },
];
/** MOD_SOURCES index → FAMILIES row (-1 for "none"). */
const SRC_FAMILY: readonly number[] = MOD_SOURCES.map((s) => FAMILIES.findIndex((f) => f.test(s)));
/** Source indexes per family. */
const FAMILY_SOURCES: readonly number[][] = FAMILIES.map((_, f) => MOD_SOURCES.map((_, i) => i).filter((i) => SRC_FAMILY[i] === f));

const COL_LABEL: Partial<Record<ParamGroup, string>> = {
  osc: "OSC", voice: "VOICE", bank: "BANK", fx: "FX", lfo: "LFO", env: "ENV", func: "FUNC", chaos: "CHAOS", master: "MSTR", layer: "LAYER", global: "GLOB",
};
/** Destination-group columns, in param-table order. */
const DEST_COLS: readonly ParamGroup[] = MOD_DESTS.reduce<ParamGroup[]>((acc, pi) => {
  const g = PARAMS[pi].group;
  if (!acc.includes(g)) acc.push(g);
  return acc;
}, []);
/** MOD_DESTS index → column. */
const DST_COL: readonly number[] = MOD_DESTS.map((pi) => DEST_COLS.indexOf(PARAMS[pi].group));
const COL_DESTS: readonly number[][] = DEST_COLS.map((_, c) => MOD_DESTS.map((_, d) => d).filter((d) => DST_COL[d] === c));

const SLOT_IDX = Array.from({ length: MOD_SLOTS }, (_, k) => ({
  src: paramIndex(`mod${k + 1}.src`),
  dst: paramIndex(`mod${k + 1}.dst`),
  amount: paramIndex(`mod${k + 1}.amount`),
}));

const LABEL_W = 50;
const HEAD_H = 12;

interface Route { slot: number; src: number; dst: number; row: number; col: number; amount: number }

function activeRoutes(host: InsanityHost): Route[] {
  const out: Route[] = [];
  SLOT_IDX.forEach((s, slot) => {
    const src = Math.round(host.values[s.src]);
    const amount = host.values[s.amount];
    if (src === 0 || amount === 0) return;
    const dst = Math.round(host.values[s.dst]);
    const row = SRC_FAMILY[src] ?? -1;
    const col = DST_COL[dst] ?? -1;
    if (row < 0 || col < 0) return;
    out.push({ slot, src, dst, row, col, amount });
  });
  return out;
}

/** Live value of a mod source for animation, roughly 0..1. */
function sourceValue(host: InsanityHost, m: MeterReport | null, src: number): number {
  const name = MOD_SOURCES[src];
  const mm = /^(lfo|env|func)(\d+)$/.exec(name);
  if (mm && m) {
    const arr = m[mm[1] as "lfo" | "env" | "func"];
    const v = arr?.[Number(mm[2]) - 1] ?? 0;
    return mm[1] === "env" ? v : v * 0.5 + 0.5;
  }
  if (name.startsWith("macro") || name.startsWith("xy")) return host.getById(name);
  if (name === "chaos" && m) return Math.max(0, Math.min(1, m.chaos * 0.5 + 0.5));
  return 0.5;
}

function cellAt(w: number, h: number, x: number, y: number): { row: number; col: number } | null {
  const cw = (w - LABEL_W) / DEST_COLS.length;
  const rh = (h - HEAD_H) / FAMILIES.length;
  const col = Math.floor((x - LABEL_W) / cw);
  const row = Math.floor((y - HEAD_H) / rh);
  if (col < 0 || col >= DEST_COLS.length || row < 0 || row >= FAMILIES.length) return null;
  return { row, col };
}

/** "COMPLEX MODULATION ROUTING": source families × destination groups, live curves per route. */
export const ModRoutingPanel = memo(function ModRoutingPanel(): JSX.Element {
  const host = useInsanityHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const routes = useRef<Route[]>([]);
  const dirty = useRef(true);
  const hover = useRef<{ row: number; col: number } | null>(null);

  useEffect(() => {
    const mark = (): void => { dirty.current = true; };
    const unsubs = SLOT_IDX.flatMap((s) => [host.subscribe(s.src, mark), host.subscribe(s.dst, mark), host.subscribe(s.amount, mark)]);
    return () => unsubs.forEach((u) => u());
  }, [host]);

  useFrame((t) => {
    const fit = fitCanvas(canvasRef.current);
    if (!fit) return;
    if (dirty.current) {
      routes.current = activeRoutes(host);
      dirty.current = false;
    }
    const { g, w, h } = fit;
    const m = host.lastMeters;
    const cw = (w - LABEL_W) / DEST_COLS.length;
    const rh = (h - HEAD_H) / FAMILIES.length;
    g.fillStyle = "#050506";
    g.fillRect(0, 0, w, h);

    // counts per cell
    const counts = new Uint8Array(FAMILIES.length * DEST_COLS.length);
    for (const r of routes.current) counts[r.row * DEST_COLS.length + r.col]++;

    g.font = "bold 7px ui-monospace, monospace";
    g.textBaseline = "middle";
    // column heads
    g.textAlign = "center";
    DEST_COLS.forEach((grp, c) => {
      g.fillStyle = "#71717a";
      g.fillText(COL_LABEL[grp] ?? grp.toUpperCase(), LABEL_W + c * cw + cw / 2, HEAD_H / 2);
    });
    // rows + cells
    FAMILIES.forEach((f, r) => {
      const y = HEAD_H + r * rh;
      g.textAlign = "right";
      g.fillStyle = f.color;
      g.fillText(f.label, LABEL_W - 4, y + rh / 2);
      for (let c = 0; c < DEST_COLS.length; c++) {
        const x = LABEL_W + c * cw;
        const n = counts[r * DEST_COLS.length + c];
        const hov = hover.current && hover.current.row === r && hover.current.col === c;
        g.fillStyle = n > 0 ? f.color : hov ? "#27272a" : "#111114";
        g.globalAlpha = n > 0 ? Math.min(0.85, 0.3 + n * 0.18) : 1;
        g.fillRect(x + 1, y + 1, cw - 2, rh - 2);
        g.globalAlpha = 1;
        if (n > 1) {
          g.textAlign = "center";
          g.fillStyle = "#000";
          g.fillText(String(n), x + cw / 2, y + rh / 2);
        }
      }
    });

    // curves: from the source label edge to the destination cell, pulsing with the source
    g.lineWidth = 1.2;
    for (const route of routes.current) {
      const f = FAMILIES[route.row];
      const v = sourceValue(host, m, route.src);
      const y0 = HEAD_H + route.row * rh + rh / 2;
      const x1 = LABEL_W + route.col * cw + cw / 2;
      const wob = Math.sin(t / 400 + route.slot) * 4;
      const yMid = HEAD_H + ((DEST_COLS.length - route.col) / DEST_COLS.length) * (h - HEAD_H) + wob;
      g.strokeStyle = f.color;
      g.globalAlpha = 0.25 + 0.75 * Math.abs(route.amount) * (0.4 + 0.6 * v);
      g.beginPath();
      g.moveTo(LABEL_W, y0);
      g.bezierCurveTo(LABEL_W + (x1 - LABEL_W) * 0.4, yMid, x1 - cw, y0 + (yMid - y0) * 0.2, x1, y0);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(x1, y0, 1.5 + v * 2, 0, Math.PI * 2);
      g.fill();
    }
    g.textAlign = "left";
    g.fillStyle = "#52525b";
    g.fillText(`${routes.current.length}/${MOD_SLOTS} ROUTES`, 2, HEAD_H / 2);
  });

  const onClick = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const cell = cellAt(r.width, r.height, e.clientX - r.left, e.clientY - r.top);
    if (!cell) return;
    const current = activeRoutes(host);
    if (e.shiftKey) {
      // Shift-click clears every route in the cell.
      for (const route of current) {
        if (route.row === cell.row && route.col === cell.col) {
          host.setParam(SLOT_IDX[route.slot].src, 0);
          host.setParam(SLOT_IDX[route.slot].amount, 0);
        }
      }
      return;
    }
    const free = SLOT_IDX.findIndex((s) => Math.round(host.values[s.src]) === 0 || host.values[s.amount] === 0);
    if (free < 0) return; // all 64 slots busy: the nightmare is complete
    const usedSrc = new Set(current.map((x) => x.src));
    const usedDst = new Set(current.map((x) => x.dst));
    const srcs = FAMILY_SOURCES[cell.row];
    const dsts = COL_DESTS[cell.col];
    const src = srcs.find((s) => !usedSrc.has(s)) ?? srcs[0];
    const dst = dsts.find((d) => !usedDst.has(d)) ?? dsts[Math.floor(Math.random() * dsts.length)];
    if (src === undefined || dst === undefined) return;
    host.setParam(SLOT_IDX[free].src, src);
    host.setParam(SLOT_IDX[free].dst, dst);
    host.setParam(SLOT_IDX[free].amount, 0.4);
  }, [host]);

  const onMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    hover.current = cellAt(r.width, r.height, e.clientX - r.left, e.clientY - r.top);
  }, []);
  const onLeave = useCallback(() => { hover.current = null; }, []);

  return (
    <Section title="Complex Modulation Routing" className="h-full" bodyClassName="flex flex-col gap-0.5">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Modulation routing grid. Click a cell to add a route; shift-click to clear it."
        title="Click a cell: route that source family to that destination group (first free slot). Shift-click: clear the cell."
        className="min-h-[220px] w-full flex-1 cursor-pointer rounded-[2px] border border-zinc-800"
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      />
      <div className="text-[7px] uppercase tracking-wider text-zinc-500">Click = new route · Shift-click = clear · edit amounts in the Nightmare Matrix</div>
    </Section>
  );
});
