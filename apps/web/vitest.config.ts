import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom" },
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
