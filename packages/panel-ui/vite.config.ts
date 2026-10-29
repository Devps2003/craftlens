import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "../../apps/extension/media"),
    emptyOutDir: false,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, "src/main.tsx"),
      output: {
        format: "iife",
        entryFileNames: "panel.js",
        assetFileNames: "panel.css",
        inlineDynamicImports: true,
      },
    },
  },
});
