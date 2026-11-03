"use client";

import { memo } from "react";
import { OSC_COUNT } from "@/lib/insanity/params";
import { ACCENTS, ParamKnob, ParamSelect } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";

const KNOBS = ["level", "coarse", "fine", "pan", "shape", "ratio", "unison", "detune"] as const;

const OscColumn = memo(function OscColumn({ i }: { i: number }): JSX.Element {
  const color = ACCENTS[(i - 1) % ACCENTS.length];
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-0.5 rounded-[2px] border border-zinc-800/80 bg-black/30 p-0.5">
      <div className="text-center text-[8px] font-bold uppercase tracking-wider" style={{ color }}>OSC {i}</div>
      <ParamSelect id={`osc${i}.mode`} className="w-full" />
      <div className="grid grid-cols-2 justify-items-center gap-y-0.5">
        {KNOBS.map((k) => (
          <ParamKnob key={k} id={`osc${i}.${k}`} size={22} color={color} />
        ))}
      </div>
    </div>
  );
});

/** "GLOBAL EVERYTHING": eight oscillator columns. */
export const OscillatorsPanel = memo(function OscillatorsPanel(): JSX.Element {
  return (
    <Section title="Global Everything" badge="(8x)" className="h-full" bodyClassName="grid grid-cols-8 gap-0.5">
      {Array.from({ length: OSC_COUNT }, (_, k) => (
        <OscColumn key={k} i={k + 1} />
      ))}
    </Section>
  );
});
