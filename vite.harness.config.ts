import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev harness build: a stand-alone page (dev/index.html) with a Leaflet map
 * that fakes the MyGeotab Map Add-In `service` object so the add-in can be
 * developed and headless-tested outside MyGeotab.
 *
 *   npm run dev            → http://localhost:5173/
 *   npm run build:harness  → dist-harness/
 */
export default defineConfig({
  root: "dev",
  base: "",
  plugins: [react()],
  build: {
    outDir: "../dist-harness",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: { port: 5173, strictPort: false },
});
