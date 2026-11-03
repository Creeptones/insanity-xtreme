"use client";
// INSANITY — content panels (presets, randomizer, help, instrument layers).
// Contract with the page: these exact named exports, no required props.
export { TopBar } from "./TopBar";
export { LayerManager, PhysicalModelingPanel, SpectralPanel, AtmospherePanel } from "./LayerPanels";
export { RandomizerPanel, SoundBrowserPanel, HelpPanel } from "./MiscPanels";
