"use client";

import { memo } from "react";
import { BANK_BANDS } from "@/lib/insanity/params";
import { ACCENTS, ParamKnob, ParamSelect, ParamToggle } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";

const ROW_COLORS = [ACCENTS[1], ACCENTS[0], ACCENTS[4], ACCENTS[2]] as const;

const BandStrip = memo(function BandStrip({ i }: { i: number }): JSX.Element {
  const color = ROW_COLORS[Math.floor((i - 1) / 8) % ROW_COLORS.length];
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-[2px] border border-zinc-800/70 bg-black/30 px-px py-0.5">
      <div className="flex w-full items-center justify-between gap-px">
        <span className="text-[7px] font-bold text-zinc-400">F{i}</span>
        <ParamToggle id={`bank${i}.on`} color={color} />
      </div>
      <ParamSelect id={`bank${i}.type`} className="w-full appearance-none px-0 text-center text-[7px]" />
      <ParamKnob id={`bank${i}.freq`} label="Frq" size={15} color={color} />
      <ParamKnob id={`bank${i}.q`} label="Q" size={15} color={color} />
      <ParamKnob id={`bank${i}.gain`} label="Gain" size={15} color={color} />
    </div>
  );
});

/** "FILTERS (32x)": 32 bus filter bands + the 4×8 parallel-routing grid. */
export const FiltersPanel = memo(function FiltersPanel(): JSX.Element {
  return (
    <Section title="Filters" badge="(32x)" className="h-full" bodyClassName="flex flex-col gap-1">
      <div className="grid gap-px max-lg:![grid-template-columns:repeat(4,minmax(0,1fr))] max-lg:gap-1" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {Array.from({ length: BANK_BANDS }, (_, k) => (
          <BandStrip key={k} i={k + 1} />
        ))}
      </div>
      <div className="flex items-stretch gap-1">
        <div className="flex-1 rounded-[2px] border border-zinc-800 bg-black/40 p-1">
          <div className="mb-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-300">
            <span className="text-zinc-500">▪</span> Filter routing <span className="font-normal text-zinc-500">lit = parallel with its row</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-0.5">
                <span className="w-7 shrink-0 text-[7px] uppercase text-zinc-500">Row {row + 1}</span>
                <div className="grid flex-1 grid-cols-8 gap-0.5">
                  {Array.from({ length: 8 }, (_, c) => {
                    const band = row * 8 + c + 1;
                    return <ParamToggle key={band} id={`bank${band}.parallel`} label={String(band)} color="#4ade80" className="h-3.5 w-full" />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-[2px] border border-zinc-800 bg-black/40 px-1">
          <ParamKnob id="bank.mix" label="Bank Mix" size={30} color={ACCENTS[3]} />
        </div>
      </div>
    </Section>
  );
});
