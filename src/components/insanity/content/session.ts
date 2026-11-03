"use client";

// INSANITY — preset session shared by the TopBar, Sound Browser, Randomizer and Help
// panels: current preset name, user preset list, one-step undo and a deadpan
// status line. One per host (WeakMap), read through useSession().

import { useSyncExternalStore } from "react";
import type { InsanityHost } from "@/lib/insanity/host";
import { getLayerManager } from "@/lib/insanity/layers/manager";
import { defaultValues } from "@/lib/insanity/params";
import {
  DEFAULT_PRESET_NAME, FACTORY_PRESETS, buildPresetValues, deleteUserPreset, listUserPresets, saveUserPreset, userPresetValues,
  type FactoryPreset, type UserPreset,
} from "@/lib/insanity/presets";
import { useInsanityHost } from "../InsanityContext";

export interface SessionState {
  presetName: string;
  /** True when the current name is a saved user preset (SAVE overwrites it). */
  isUser: boolean;
  /** Factory index of the current preset, -1 for user / randomized. */
  factoryIndex: number;
  userPresets: UserPreset[];
  canUndo: boolean;
  message: string | null;
}

export class ContentSession {
  private state: SessionState = {
    presetName: DEFAULT_PRESET_NAME, isUser: false, factoryIndex: 0, userPresets: [], canUndo: false, message: null,
  };
  private undoValues: Float32Array | null = null;
  private undoName = DEFAULT_PRESET_NAME;
  private subs = new Set<() => void>();
  private msgTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedUser = false;

  constructor(private host: InsanityHost) {}

  subscribe = (f: () => void): (() => void) => {
    this.subs.add(f);
    if (!this.loadedUser) {
      this.loadedUser = true;
      this.refreshUser();
    }
    return () => this.subs.delete(f);
  };
  getState = (): SessionState => this.state;
  private patch(p: Partial<SessionState>): void {
    this.state = { ...this.state, ...p };
    this.subs.forEach((f) => f());
  }

  say(message: string): void {
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.patch({ message });
    this.msgTimer = setTimeout(() => this.patch({ message: null }), 4000);
  }

  refreshUser(): void {
    this.patch({ userPresets: listUserPresets() });
  }

  private rememberUndo(): void {
    this.undoValues = this.host.values.slice();
    this.undoName = this.state.presetName;
  }

  loadFactory(p: FactoryPreset): void {
    this.rememberUndo();
    this.host.allNotesOff();
    this.host.setAll(buildPresetValues(p));
    getLayerManager(this.host).setBraidsModel(p.braidsModel ?? "pluck");
    this.patch({ presetName: p.name, isUser: false, factoryIndex: FACTORY_PRESETS.indexOf(p), canUndo: true });
  }

  loadUser(u: UserPreset): void {
    this.rememberUndo();
    this.host.allNotesOff();
    this.host.setAll(userPresetValues(u));
    if (u.braidsModel) getLayerManager(this.host).setBraidsModel(u.braidsModel);
    this.patch({ presetName: u.name, isUser: true, factoryIndex: -1, canUndo: true });
  }

  /** Step through factory presets (dir ±1). */
  step(dir: number): void {
    const n = FACTORY_PRESETS.length;
    const i = this.state.factoryIndex < 0 ? 0 : (this.state.factoryIndex + dir + n) % n;
    this.loadFactory(FACTORY_PRESETS[i]);
  }

  /** Apply a whole new value set (randomize), keeping the old one for UNDO. */
  apply(values: ArrayLike<number>, name: string): void {
    this.rememberUndo();
    this.host.setAll(values);
    this.patch({ presetName: name, isUser: false, factoryIndex: -1, canUndo: true });
  }

  undo(): void {
    if (!this.undoValues) return;
    const v = this.undoValues;
    const name = this.undoName;
    this.undoValues = null;
    this.host.setAll(v);
    this.patch({ presetName: name, isUser: this.state.userPresets.some((u) => u.name === name), factoryIndex: FACTORY_PRESETS.findIndex((p) => p.name === name), canUndo: false });
    this.say("Undone. Like it never happened.");
  }

  /** FIX EVERYTHING: defaults + panic. */
  reset(): void {
    this.rememberUndo();
    this.host.panic();
    this.host.setAll(defaultValues());
    getLayerManager(this.host).setBraidsModel("pluck");
    this.patch({ presetName: DEFAULT_PRESET_NAME, isUser: false, factoryIndex: 0, canUndo: true });
  }

  saveAs(name: string): void {
    const n = name.trim().slice(0, 60);
    if (!n) return;
    if (FACTORY_PRESETS.some((p) => p.name === n)) {
      this.say("That name belongs to a factory preset. Pick your own name.");
      return;
    }
    const ok = saveUserPreset(n, this.host.values, getLayerManager(this.host).getBraidsModel());
    this.refreshUser();
    if (ok) {
      this.patch({ presetName: n, isUser: true, factoryIndex: -1 });
      this.say(`Saved "${n}". It's in the Sound Browser.`);
    } else {
      this.say("Couldn't save: this browser has storage switched off.");
    }
  }

  /** SAVE: overwrite the current user preset, or return false to ask for a name. */
  save(): boolean {
    if (!this.state.isUser) return false;
    this.saveAs(this.state.presetName);
    return true;
  }

  deleteCurrent(): void {
    if (!this.state.isUser) {
      this.say("Factory presets can't be deleted. They're load-bearing.");
      return;
    }
    const n = this.state.presetName;
    deleteUserPreset(n);
    this.refreshUser();
    this.patch({ isUser: false, factoryIndex: -1, presetName: `${n} (deleted)` });
    this.say(`Deleted "${n}".`);
  }
}

const sessions = new WeakMap<InsanityHost, ContentSession>();
export function getSession(host: InsanityHost): ContentSession {
  let s = sessions.get(host);
  if (!s) sessions.set(host, (s = new ContentSession(host)));
  return s;
}

const SERVER_STATE: SessionState = {
  presetName: DEFAULT_PRESET_NAME, isUser: false, factoryIndex: 0, userPresets: [], canUndo: false, message: null,
};

/** [state, session]. */
export function useSession(): [SessionState, ContentSession] {
  const host = useInsanityHost();
  const s = getSession(host);
  const state = useSyncExternalStore(s.subscribe, s.getState, () => SERVER_STATE);
  return [state, s];
}
