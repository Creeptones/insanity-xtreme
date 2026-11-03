"use client";

// INSANITY — which face of the synth is showing.
//   "insane"   the full 799-control board (desktop grid, or the mobile tab scroll)
//   "onepager" the stripped-down ONE PAGER: the best controls on one screen
// Both drive the same engine and params, so switching never changes the sound.
// The choice is remembered per browser (best effort).

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ViewMode = "insane" | "onepager";

interface ViewModeValue {
  view: ViewMode;
  setView: (v: ViewMode) => void;
}

const STORAGE_KEY = "insanity.view.v1";
const ViewModeContext = createContext<ViewModeValue>({ view: "insane", setView: () => {} });

function readStored(): ViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "onepager" ? "onepager" : "insane";
  } catch {
    return "insane";
  }
}

export function ViewModeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [view, setViewState] = useState<ViewMode>(readStored);
  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // storage blocked: the switch still works for this visit
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);
  return <ViewModeContext.Provider value={{ view, setView }}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeValue {
  return useContext(ViewModeContext);
}
