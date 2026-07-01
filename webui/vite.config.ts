import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  css: {
    transformer: "postcss"
  },
  build: {
    outDir: "../dist/webui",
    emptyOutDir: true,
    cssMinify: "esbuild"
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3210",
      "/ws": {
        target: "ws://127.0.0.1:3210",
        ws: true
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"]
  }
});
