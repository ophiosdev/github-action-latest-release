import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        statements: 92,
        branches: 92,
        functions: 92,
        lines: 92,
      },
    },
  },
})
