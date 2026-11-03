/**
 * braidsWorkletLoader — idempotent registration of the Braids voice
 * AudioWorklet processors (KS pluck, modal bell/glass, reed, bowed, breath).
 *
 * The loader returns a promise cached per-context. Failure to load surfaces
 * via the rejected promise, which the caller reports as a layer error.
 */

import { workletUrl } from "@/lib/workletUrl";

const VOICE_WORKLET_PATHS: readonly string[] = [
  "braids-ks-pluck.js",
  "braids-modal.js",
  "braids-reed.js",
  "braids-bowed.js",
  "braids-breath.js",
].map(workletUrl);

const voiceLoaded = new WeakMap<AudioContext, Promise<void>>();

export async function ensureBraidsVoiceWorklets(
  ctx: AudioContext,
): Promise<void> {
  return loadList(ctx, voiceLoaded, VOICE_WORKLET_PATHS);
}

async function loadList(
  ctx: AudioContext,
  cache: WeakMap<AudioContext, Promise<void>>,
  paths: readonly string[],
): Promise<void> {
  const hit = cache.get(ctx);
  if (hit) return hit;
  if (!ctx.audioWorklet) {
    const err = Promise.reject(new Error("AudioWorklet unavailable"));
    cache.set(ctx, err);
    return err;
  }
  const p = (async () => {
    for (const path of paths) {
      // Sequential rather than Promise.all — failure mode is clearer and
      // module sizes are small.
      await ctx.audioWorklet.addModule(path);
    }
  })();
  cache.set(ctx, p);
  return p;
}
