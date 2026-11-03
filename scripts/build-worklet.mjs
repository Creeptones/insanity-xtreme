// Worklet bundler: builds src/worklets/insanity/ into the single classic
// AudioWorklet script public/worklets/insanity-engine.js.
//
// Run:   node scripts/build-worklet.mjs          (one-shot)
//        node scripts/build-worklet.mjs --watch   (rebuild on change)
//
// AudioWorkletGlobalScope cannot `import`, so the output MUST be a single
// classic script: esbuild bundles the entry, emits an IIFE, and the top-level
// `registerProcessor(<name>, …)` runs at load. `AudioWorkletProcessor` /
// `registerProcessor` / `sampleRate` / `currentTime` are free globals provided
// by the worklet scope; esbuild leaves undeclared identifiers untouched.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcDir = resolve(root, "src");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [resolve(root, "src", "worklets", "insanity", "index.js")],
  outfile: resolve(root, "public", "worklets", "insanity-engine.js"),
  bundle: true,
  format: "iife", // classic script; no import/export survives
  platform: "browser",
  target: "es2022", // modern AudioWorklet; no downleveling drift
  treeShaking: true,
  // Resolve the "@/..." alias so the worklet can import the single-source
  // param table and protocol from src/lib/insanity/.
  alias: { "@": srcDir },
  minify: false, // keep the bundle reviewable and debuggable
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
  banner: {
    js:
      "// GENERATED FILE — DO NOT EDIT.\n" +
      "// Source: src/worklets/insanity/  •  Rebuild: npm run build:worklet\n",
  },
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[worklet-build] watching src/worklets/insanity/ …");
} else {
  await esbuild.build(options);
  console.log(`[worklet-build] wrote ${options.outfile}`);
}
