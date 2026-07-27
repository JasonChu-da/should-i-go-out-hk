import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "json-summary"],
      include: ["lib/**/*.{ts,tsx}", "app/api/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "lib/**/types.ts",
        "lib/domain/outlook.ts",
        "tests/**",
        "e2e/**",
        ".next/**",
        "coverage/**",
        "playwright-report/**",
        "test-results/**",
        "*.config.{js,mjs,ts}",
        "next-env.d.ts",
      ],
      thresholds: {
        statements: 88,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
