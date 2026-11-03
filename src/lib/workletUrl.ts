// Resolve a file in public/worklets/ against Vite's base URL, so the app works both at
// the site root (local dev) and under a GitHub Pages subpath such as /insanity-xtreme/.
// Page-side only: import.meta.env does not exist inside the AudioWorklet bundle, so
// nothing the worklet imports (params.ts, protocol.ts) may import this.
export function workletUrl(file: string): string {
  return `${import.meta.env.BASE_URL}worklets/${file}`;
}
