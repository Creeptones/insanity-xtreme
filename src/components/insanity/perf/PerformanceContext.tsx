"use client";

// INSANITY perf — React access to the single PerformanceEngine.
//   <PerformanceProvider>        creates the engine for the page's InsanityHost
//   usePerf()                    → the engine
//   usePerfSettings()            → engine.settings, re-rendering on settings changes
//   useSignal(sig)               → re-render whenever that engine signal fires

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { PerformanceEngine, type PerfSettings, type Signal } from "@/lib/insanity/perf/engine";
import { useInsanityHost } from "../InsanityContext";

const PerfContext = createContext<PerformanceEngine | null>(null);

export function PerformanceProvider({ children }: { children: ReactNode }): JSX.Element {
  const host = useInsanityHost();
  const [engine] = useState(() => new PerformanceEngine(host));
  useEffect(() => {
    engine.attach();
    return () => engine.dispose();
  }, [engine]);
  return <PerfContext.Provider value={engine}>{children}</PerfContext.Provider>;
}

export function usePerf(): PerformanceEngine {
  const e = useContext(PerfContext);
  if (!e) throw new Error("usePerf outside PerformanceProvider");
  return e;
}

export function useSignal(sig: Signal): number {
  return useSyncExternalStore(sig.subscribe, sig.getVersion, sig.getVersion);
}

export function usePerfSettings(): PerfSettings {
  const e = usePerf();
  useSignal(e.settingsSig);
  return e.settings;
}
