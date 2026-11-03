"use client";

// INSANITY — React access to the single InsanityHost.
//   useInsanityHost()      → the host (start(), noteOn(), setParam(), …)
//   useParam(id)           → [value, setValue] bound to one param, re-renders only on that param
//   useMeters()            → latest MeterReport (throttled by the worklet to ~30 Hz) or null
//   useEngineStarted()     → true once the AudioContext is running

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { InsanityHost } from "@/lib/insanity/host";
import { paramIndex } from "@/lib/insanity/params";
import type { MeterReport } from "@/lib/insanity/protocol";

const HostContext = createContext<InsanityHost | null>(null);

export function InsanityProvider({ children }: { children: ReactNode }): JSX.Element {
  const [host] = useState(() => new InsanityHost());
  useEffect(() => () => host.dispose(), [host]);
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

export function useInsanityHost(): InsanityHost {
  const h = useContext(HostContext);
  if (!h) throw new Error("useInsanityHost outside InsanityProvider");
  return h;
}

/** Bind to a param by index. */
export function useParamIndex(index: number): [number, (v: number) => void] {
  const host = useInsanityHost();
  const value = useSyncExternalStore(
    useCallback((f: () => void) => host.subscribe(index, f), [host, index]),
    () => host.values[index],
    () => host.values[index],
  );
  const set = useCallback((v: number) => host.setParam(index, v), [host, index]);
  return [value, set];
}

/** Bind to a param by id (e.g. "osc1.level"). */
export function useParam(id: string): [number, (v: number) => void] {
  return useParamIndex(paramIndex(id));
}

export function useMeters(): MeterReport | null {
  const host = useInsanityHost();
  const [m, setM] = useState<MeterReport | null>(host.lastMeters);
  useEffect(() => host.onMeters(setM), [host]);
  return m;
}

export function useEngineStarted(): boolean {
  const host = useInsanityHost();
  const [s, setS] = useState(host.started);
  useEffect(() => host.onStarted(() => setS(true)), [host]);
  return s;
}
