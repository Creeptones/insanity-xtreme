import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// BASE_PATH sets the public base URL. Local dev uses "/"; the GitHub Pages
// workflow sets it to "/insanity-xtreme/". Worklet URLs follow it via
// src/lib/workletUrl.ts.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
