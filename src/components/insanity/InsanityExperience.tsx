"use client";

// INSANITY XTREME PRO MAX ULTRA DELUXE v∞ (It Actually Works Edition) — the whole page.
// Layout mirrors the reference screenshot: five dense rows of sections under a top bar.

import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { InsanityProvider, useEngineStarted, useInsanityHost } from "./InsanityContext";
import {
  ChordMemoryPanel, InputChooser, InputStatus, KeyboardPanel, MidiMatrixPanel, PerformanceProvider, ScaleEditorPanel, StepSequencerPanel, TuningPanel,
} from "@/components/insanity/perf";
import {
  AtmospherePanel, HelpPanel, LayerManager, PhysicalModelingPanel, RandomizerPanel, SoundBrowserPanel, SpectralPanel, TopBar,
} from "@/components/insanity/content";
import {
  ChaosPanel, EffectsPanel, FiltersPanel, MacroPanel, MasterPanel, ModRoutingPanel, ModulatorsPanel, NightmareMatrixPanel,
  OscillatorsPanel, PerformanceMonitorPanel, SystemPanel, VoicePanel, WavetablePanel, XyPadsPanel,
} from "./panels";
import { MobileBoard } from "./MobileBoard";

/** Below this width the page switches to the scrolling, collapsible mobile layout. */
const MOBILE_QUERY = "(max-width: 1023px)";

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = (): void => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/** Grid cell that stretches whatever <Section> the child renders to the cell height. */
function Cell({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn("flex min-w-0 flex-col [&>*]:flex-1", className)}>{children}</div>;
}

function Row({ cols, children, className }: { cols: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <div className={cn("grid gap-1", className)} style={{ gridTemplateColumns: cols }}>
      {children}
    </div>
  );
}

function PowerOverlay({ mobile }: { mobile: boolean }): JSX.Element | null {
  const host = useInsanityHost();
  const started = useEngineStarted();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await host.start();
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [host]);
  // On mobile the input chip lives in the page flow (MobileBoard), clear of the pinned keyboard.
  if (started) return mobile ? null : <InputStatus />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-[2px]">
      <div className="flex w-full flex-col items-center gap-4 px-4 text-center">
        <h2 className="text-2xl font-black uppercase tracking-widest text-white drop-shadow-[0_0_20px_rgba(239,68,68,0.7)]">
          {busy ? "Unleashing..." : "How do you want to play?"}
        </h2>
        <InputChooser onStart={onStart} busy={busy} />
        <p className="max-w-md text-xs text-zinc-400">
          Every knob on this page is wired to a real synth engine. You can switch inputs any time{mobile ? " from the top of the page" : " from the corner"}.
        </p>
        {error ? <p className="max-w-md font-mono text-xs text-red-400">Engine failed to start: {error}</p> : null}
      </div>
    </div>
  );
}

const Board = memo(function Board(): JSX.Element {
  return (
    <div className="flex min-w-[1400px] flex-col gap-1 p-1">
      <TopBar />
      <LayerManager />

      {/* Rows 1–2: SYSTEM spans both */}
      <div className="grid gap-1" style={{ gridTemplateColumns: "100px minmax(0, 1fr)" }}>
        <Cell className="row-span-2"><SystemPanel /></Cell>
        <Row cols="minmax(0, 4.2fr) minmax(0, 3.4fr) minmax(0, 2.4fr)">
          <Cell><OscillatorsPanel /></Cell>
          <Cell><FiltersPanel /></Cell>
          <Cell><EffectsPanel /></Cell>
        </Row>
        <Row cols="minmax(0, 1.7fr) minmax(0, 2.6fr) minmax(0, 3fr) minmax(0, 2.3fr)">
          <Cell><MidiMatrixPanel /></Cell>
          <Cell><StepSequencerPanel /></Cell>
          <Cell><ModulatorsPanel /></Cell>
          <div className="flex min-w-0 flex-col gap-1">
            <Cell className="flex-1"><MacroPanel /></Cell>
            <Cell><XyPadsPanel /></Cell>
          </div>
        </Row>
      </div>

      {/* Row 3 */}
      <Row cols="minmax(0, 1.5fr) minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1.4fr)">
        <Cell><VoicePanel /></Cell>
        <Cell><SpectralPanel /></Cell>
        <Cell><PhysicalModelingPanel /></Cell>
        <Cell><WavetablePanel /></Cell>
        <Cell><ChaosPanel /></Cell>
        <Cell><AtmospherePanel /></Cell>
      </Row>

      {/* Row 4 */}
      <Row cols="minmax(0, 4.6fr) minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 2fr)">
        <Cell><NightmareMatrixPanel /></Cell>
        <Cell><ModRoutingPanel /></Cell>
        <Cell><RandomizerPanel /></Cell>
        <Cell><PerformanceMonitorPanel /></Cell>
        <Cell><MasterPanel /></Cell>
      </Row>

      {/* Row 5 */}
      <Row cols="minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 2fr) minmax(0, 1.8fr) minmax(0, 1fr)">
        <Cell><KeyboardPanel /></Cell>
        <Cell><ScaleEditorPanel /></Cell>
        <Cell><TuningPanel /></Cell>
        <Cell><ChordMemoryPanel /></Cell>
        <Cell><SoundBrowserPanel /></Cell>
        <Cell><HelpPanel /></Cell>
      </Row>

      <footer className="flex flex-col items-center gap-1 py-3">
        <p className="text-[10px] text-zinc-500">
          <a href="https://ephemera.fm" className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300">
            Built in one night by Ephemera — every single knob makes sound.
          </a>
        </p>
      </footer>
    </div>
  );
});

function Layout(): JSX.Element {
  const mobile = useIsMobile();
  const started = useEngineStarted();
  return (
    <main id="main-content" className="min-h-screen bg-[#0a0a0b] text-zinc-200">
      <h1 className="sr-only">INSANITY XTREME PRO MAX ULTRA DELUXE v∞ (It Actually Works Edition)</h1>
      {mobile ? (
        <MobileBoard started={started} />
      ) : (
        <div className="overflow-x-auto">
          <Board />
        </div>
      )}
      <PowerOverlay mobile={mobile} />
    </main>
  );
}

export function InsanityExperience(): JSX.Element {
  return (
    <InsanityProvider>
      <PerformanceProvider>
        <Layout />
      </PerformanceProvider>
    </InsanityProvider>
  );
}

export default InsanityExperience;
