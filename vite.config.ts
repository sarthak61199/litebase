import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  worker: {
    format: "es",
  },
  test: {
    include: ["__tests__/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["__tests__/setup.ts"],
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
        "node_modules/**",
        "dist/**",
        "**/*.config.*",
        "**/*.d.ts",
        "__tests__/**",
      ],
    },
  },
});
