"use client";

import { memo } from "react";
import { MACRO_COUNT } from "@/lib/insanity/params";
import { ACCENTS, ParamKnob } from "../InsanityKnob";
import { Section } from "../InsanityPrimitives";

/** "MACRO UNIVERSE (64x)": 64 macro knobs, 8×8. Macros are mod sources (see the Nightmare Matrix). */
export const MacroPanel = memo(function MacroPanel(): JSX.Element {
  return (
    <Section title="Macro Universe" badge="(64x)" bodyClassName="grid grid-cols-8 justify-items-center gap-y-0.5 max-lg:grid-cols-4 max-lg:gap-y-2">
      {Array.from({ length: MACRO_COUNT }, (_, k) => (
        <ParamKnob key={k} id={`macro${k + 1}`} size={24} color={ACCENTS[Math.floor(k / 8) % ACCENTS.length]} />
      ))}
    </Section>
  );
});
