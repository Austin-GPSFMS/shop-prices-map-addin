import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config for the GPSFMS Shop Prices MyGeotab **Map Add-In**.
 *
 * Map Add-Ins are different from page add-ins: MyGeotab injects the
 * `mapScript.src` JavaScript and `mapScript.style` CSS straight into a
 * sandboxed iframe on the Map page (sandbox="allow-scripts", so the iframe
 * has an opaque origin and no HTML document of ours). That means:
 *
 *   - we ship ONE classic (non-module, IIFE) script + ONE stylesheet with
 *     fixed file names (dist/shop-prices.js, dist/shop-prices.css);
 *   - React, Zenith and all CSS are bundled; Zenith's font files are emitted
 *     to dist/assets/ and referenced by ABSOLUTE URL (`base` below) because
 *     relative URLs can't resolve from an opaque-origin iframe;
 *   - the script registers `window.geotab.addin.gpsfmsShopPrices(elt, service)`.
 *
 * (Vite's library mode is deliberately NOT used: it inlines every asset as a
 * data: URI and turned the stylesheet into a 3 MB file.)
 *
 * Hosted at:
 *   https://austin-gpsfms.github.io/shop-prices-map-addin/dist/shop-prices.js
 *   https://austin-gpsfms.github.io/shop-prices-map-addin/dist/shop-prices.css
 */
export const PUBLIC_BASE = "https://austin-gpsfms.github.io/shop-prices-map-addin/dist/";

export default defineConfig({
  base: PUBLIC_BASE,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        format: "iife",
        name: "gpsfmsShopPrices",
        inlineDynamicImports: true,
        entryFileNames: "shop-prices.js",
        assetFileNames: (info) =>
          info.name && info.name.endsWith(".css") ? "shop-prices.css" : "assets/[name]-[hash][extname]",
      },
    },
  },
});
