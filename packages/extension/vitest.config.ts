import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.spec.ts"],
    restoreMocks: true,
    clearMocks: true,
    css: false,
  },
})
