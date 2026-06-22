import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
      exclude: [
        "src/db/rpc/protocol.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        // standard excludes
        "node_modules/**",
        "dist/**",
        "**/*.config.*",
        "**/*.d.ts",
      ],
    },
  },
});
