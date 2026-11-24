import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ["**/__tests__/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
