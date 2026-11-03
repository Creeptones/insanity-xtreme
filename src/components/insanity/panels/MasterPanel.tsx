"use client";

import { memo, type ReactNode } from "react";
import type { MeterReport } from "@/lib/insanity/protocol";
import { ACCENTS, ParamKnob } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";
import { MeterBars, Readout, type BarKind } from "./liveMeters";

const OUT_BARS: readonly BarKind[] = ["peakL", "peakR"];
const GR_BARS: readonly BarKind[] = ["gr"];
const pickGr = (m: MeterReport): string => `-${m.gainReductionDb.toFixed(1)}`;

function Sub({ title, color, children }: { title: string; color: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[2px] border border-zinc-800/80 bg-black/30 p-0.5">
      <div className="text-[7px] font-bold uppercase tracking-wider" style={{ color }}>{title}</div>
      <div className="grid grid-cols-2 justify-items-center gap-y-0.5">{children}</div>
    </div>
  );
}

/** "MASTER SECTION": EQ, compressor, limiter/clipper, output gain and meters. */
export const MasterPanel = memo(function MasterPanel(): JSX.Element {
  return (
    <Section title="Master Section" className="h-full" bodyClassName="flex gap-0.5">
      <div className="grid min-w-0 flex-1 grid-cols-3 content-start gap-0.5">
        <Sub title="Master EQ" color={ACCENTS[1]}>
          <ParamKnob id="master.eqLow" label="Low" size={22} color={ACCENTS[1]} />
          <ParamKnob id="master.eqMid" label="Mid" size={22} color={ACCENTS[1]} />
          <ParamKnob id="master.eqMidFreq" label="Mid Hz" size={22} color={ACCENTS[1]} />
          <ParamKnob id="master.eqHigh" label="High" size={22} color={ACCENTS[1]} />
        </Sub>
        <Sub title="Master Comp" color={ACCENTS[2]}>
          <ParamKnob id="master.compThresh" label="Thresh" size={22} color={ACCENTS[2]} />
          <ParamKnob id="master.compRatio" label="Ratio" size={22} color={ACCENTS[2]} />
          <ParamKnob id="master.compAttack" label="Atk" size={22} color={ACCENTS[2]} />
          <ParamKnob id="master.compRelease" label="Rel" size={22} color={ACCENTS[2]} />
          <div className="col-span-2 flex w-full items-stretch gap-0.5">
            <MeterBars bars={GR_BARS} className="h-12 w-5 shrink-0" />
            <div className="flex-1"><Readout label="GR dB" pick={pickGr} className="text-orange-400" /></div>
          </div>
        </Sub>
        <Sub title="Master Limiter" color={ACCENTS[6]}>
          <ParamKnob id="master.ceiling" label="Ceiling" size={22} color={ACCENTS[6]} />
          <ParamKnob id="master.clipper" label="Clipper" size={22} color={ACCENTS[6]} />
        </Sub>
      </div>
      <div className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-[2px] border border-zinc-800 bg-black/40 p-1">
        <div className="text-[7px] font-bold uppercase tracking-wider text-zinc-300">Master Output</div>
        <ParamKnob id="master.volume" label="Output" size={52} color={ACCENTS[0]} />
        <MeterBars bars={OUT_BARS} className="min-h-[64px] w-14 flex-1" />
      </div>
    </Section>
  );
});
