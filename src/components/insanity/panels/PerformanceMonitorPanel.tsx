"use client";

import { memo } from "react";
import type { MeterReport } from "@/lib/insanity/protocol";
import { Section } from "../InsanityPrimitives";
import { MeterBars, Readout, Scope, dbText, type BarKind } from "./liveMeters";

const BARS: readonly BarKind[] = ["peakL", "peakR", "rmsL", "rmsR", "gr", "cpu", "voices"];
const pickCpu = (m: MeterReport): string => `${(m.cpu * 100).toFixed(1)}%`;
const pickVoices = (m: MeterReport): string => String(m.voices);
const pickPeak = (m: MeterReport): string => dbText(Math.max(m.peakL, m.peakR));
const pickGr = (m: MeterReport): string => `-${m.gainReductionDb.toFixed(1)}`;

/** "PERFORMANCE MONITOR": the engine's real CPU load, voices, levels and a scope. */
export const PerformanceMonitorPanel = memo(function PerformanceMonitorPanel(): JSX.Element {
  return (
    <Section title="Performance Monitor" className="h-full" bodyClassName="flex flex-col gap-1">
      <div className="grid grid-cols-4 gap-0.5">
        <Readout label="CPU (real)" pick={pickCpu} className="text-amber-300" />
        <Readout label="Voices" pick={pickVoices} className="text-cyan-300" />
        <Readout label="Peak dB" pick={pickPeak} className="text-green-400" />
        <Readout label="GR dB" pick={pickGr} className="text-orange-400" />
      </div>
      <MeterBars bars={BARS} className="h-28" />
      <div className="text-[7px] uppercase tracking-wider text-zinc-500">Output scope</div>
      <Scope className="min-h-[56px] flex-1" />
    </Section>
  );
});
