"use client";

// INSANITY — phone / narrow-screen layout. Used below 1024px instead of the dense
// desktop board (InsanityExperience picks one, never both, so the ~800 knobs aren't
// mounted twice).
//
// One long scroll. Every <Section> becomes a tab that can be closed to its title bar
// and reopened (SectionCollapseContext). Closed sections unmount their contents, which
// also keeps the phone fast. A sticky jump bar scrolls to any section; the keyboard is
// pinned to the bottom so you can play while scrolling. Which tabs are open is
// remembered per browser (localStorage, best effort).

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SectionCollapseContext, sectionDomId, type SectionCollapse } from "./InsanityPrimitives";
import { KnobScaleContext } from "./InsanityKnob";

/** Knobs are drawn 26px on desktop; ~40px is a comfortable finger target. */
const MOBILE_KNOB_SCALE = 1.5;
import {
  ChordMemoryPanel, InputStatus, KeyboardPanel, MidiMatrixPanel, ScaleEditorPanel, StepSequencerPanel, TuningPanel,
} from "@/components/insanity/perf";
import {
  AtmospherePanel, HelpPanel, LayerManager, PhysicalModelingPanel, RandomizerPanel, SoundBrowserPanel, SpectralPanel, TopBar,
} from "@/components/insanity/content";
import {
  ChaosPanel, EffectsPanel, FiltersPanel, MacroPanel, MasterPanel, ModRoutingPanel, ModulatorsPanel, NightmareMatrixPanel,
  OscillatorsPanel, PerformanceMonitorPanel, SystemPanel, VoicePanel, WavetablePanel, XyPadsPanel,
} from "./panels";

interface Entry {
  /** Must equal the <Section title> the panel renders. */
  title: string;
  /** Short label for the jump bar. */
  short: string;
  /** Open on first visit ("essentials"). */
  open: boolean;
  panel: ReactNode;
}

// Order: play-first essentials, then sound design depth, then performance extras.
const ENTRIES: Entry[] = [
  { title: "SOUND BROWSER / HOARDER", short: "Presets", open: true, panel: <SoundBrowserPanel /> },
  { title: "Global Everything", short: "Osc", open: true, panel: <OscillatorsPanel /> },
  { title: "Voice Processing", short: "Voice", open: true, panel: <VoicePanel /> },
  { title: "Effects Galaxy", short: "FX", open: true, panel: <EffectsPanel /> },
  { title: "Master Section", short: "Master", open: true, panel: <MasterPanel /> },
  { title: "RANDOMIZER SUPREME", short: "Random", open: true, panel: <RandomizerPanel /> },
  { title: "HELP / I HAVE NO IDEA", short: "Help", open: true, panel: <HelpPanel /> },
  { title: "Step Sequencer / Mega Arpeggiator", short: "Seq", open: false, panel: <StepSequencerPanel /> },
  { title: "Filters", short: "Filters", open: false, panel: <FiltersPanel /> },
  { title: "Modulators & Envelopes", short: "Mods", open: false, panel: <ModulatorsPanel /> },
  { title: "Sound Designer's Nightmare Matrix", short: "Matrix", open: false, panel: <NightmareMatrixPanel /> },
  { title: "Complex Modulation Routing", short: "Routing", open: false, panel: <ModRoutingPanel /> },
  { title: "Macro Universe", short: "Macros", open: false, panel: <MacroPanel /> },
  { title: "XY Pads", short: "XY", open: false, panel: <XyPadsPanel /> },
  { title: "Wavetable Universe", short: "Wavetable", open: false, panel: <WavetablePanel /> },
  { title: "Chaos Engine", short: "Chaos", open: false, panel: <ChaosPanel /> },
  { title: "PHYSICAL MODELING", short: "Physical", open: false, panel: <PhysicalModelingPanel /> },
  { title: "SPECTRAL STUFF", short: "Spectral", open: false, panel: <SpectralPanel /> },
  { title: "ATMOSPHERE GENERATOR", short: "Atmos", open: false, panel: <AtmospherePanel /> },
  { title: "MIDI Matrix / Processor", short: "MIDI", open: false, panel: <MidiMatrixPanel /> },
  { title: "Scale Editor", short: "Scale", open: false, panel: <ScaleEditorPanel /> },
  { title: "Tuning System Designer", short: "Tuning", open: false, panel: <TuningPanel /> },
  { title: "Chord Memory", short: "Chords", open: false, panel: <ChordMemoryPanel /> },
  { title: "Performance Monitor", short: "Monitor", open: false, panel: <PerformanceMonitorPanel /> },
  { title: "System", short: "System", open: false, panel: <SystemPanel /> },
];
const KEYBOARD_TITLE = "Keyboard";
const STORAGE_KEY = "insanity.mobile.open.v1";

function initialOpen(): Set<string> {
  const defaults = new Set([...ENTRIES.filter((e) => e.open).map((e) => e.title), KEYBOARD_TITLE]);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved: unknown = JSON.parse(raw);
    return Array.isArray(saved) ? new Set(saved.filter((s): s is string => typeof s === "string")) : defaults;
  } catch {
    return defaults;
  }
}

function persist(open: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
  } catch {
    // Private mode or blocked storage: the layout still works, it just won't remember.
  }
}

const JumpBar = memo(function JumpBar({ open, onJump, onAll }: {
  open: Set<string>;
  onJump: (title: string) => void;
  onAll: (openAll: boolean) => void;
}): JSX.Element {
  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-30 flex items-center gap-1 border-b border-zinc-800 bg-[#0a0a0b]/95 px-1 py-1 backdrop-blur"
    >
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
        {ENTRIES.map((e) => (
          <button
            key={e.title}
            type="button"
            onClick={() => onJump(e.title)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
              open.has(e.title) ? "border-violet-500 bg-violet-950/60 text-violet-100" : "border-zinc-700 text-zinc-400",
            )}
          >
            {e.short}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onAll(open.size <= 1)}
        className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase text-zinc-300"
        title="Open or close every section"
      >
        {open.size <= 1 ? "Open all" : "Close all"}
      </button>
    </nav>
  );
});

export function MobileBoard({ started }: { started: boolean }): JSX.Element {
  const [open, setOpen] = useState<Set<string>>(initialOpen);

  const update = useCallback((next: Set<string>) => {
    setOpen(next);
    persist(next);
  }, []);

  const collapse = useMemo<SectionCollapse>(() => ({
    isOpen: (title) => open.has(title),
    toggle: (title) => {
      const next = new Set(open);
      if (next.has(title)) next.delete(title); else next.add(title);
      update(next);
    },
  }), [open, update]);

  const onJump = useCallback((title: string) => {
    if (!open.has(title)) update(new Set(open).add(title));
    // Wait a frame so a just-opened section has its height before scrolling to it.
    requestAnimationFrame(() => {
      document.getElementById(sectionDomId(title))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [open, update]);

  const onAll = useCallback((openAll: boolean) => {
    // "Close all" keeps the keyboard open; you still want to play.
    update(openAll ? new Set([...ENTRIES.map((e) => e.title), KEYBOARD_TITLE]) : new Set([KEYBOARD_TITLE]));
  }, [update]);

  const keyboardOpen = open.has(KEYBOARD_TITLE);
  return (
    <KnobScaleContext.Provider value={MOBILE_KNOB_SCALE}>
    <SectionCollapseContext.Provider value={collapse}>
      <div className="flex flex-col gap-1.5 p-1.5">
        <TopBar />
        <LayerManager />
        {started ? (
          <div className="flex justify-end">
            <InputStatus inline />
          </div>
        ) : null}
      </div>
      <JumpBar open={open} onJump={onJump} onAll={onAll} />
      <div className={cn("flex flex-col gap-1.5 p-1.5", keyboardOpen ? "pb-56" : "pb-14")}>
        {ENTRIES.map((e) => (
          <div key={e.title}>{e.panel}</div>
        ))}
        <footer className="py-3 text-center text-[11px] text-zinc-500">
          <a href="https://ephemera.fm" className="underline decoration-zinc-700 underline-offset-2">
            Built in one night by Ephemera — every single knob makes sound.
          </a>
        </footer>
      </div>
      {/* Pinned keyboard: its own tab, closable to a slim bar. */}
      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[45vh] overflow-y-auto border-t border-zinc-700 bg-[#0a0a0b] shadow-[0_-8px_24px_rgba(0,0,0,0.6)]">
        <KeyboardPanel />
      </div>
    </SectionCollapseContext.Provider>
    </KnobScaleContext.Provider>
  );
}
