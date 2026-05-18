import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: "popup.html",
        options: "options.html",
        content: "src/content/index.ts",
        background: "src/background/index.ts"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
        manualChunks: undefined
      }
    }
  }
});
