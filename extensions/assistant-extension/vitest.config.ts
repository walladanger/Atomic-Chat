import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // Node rather than jsdom: what is tested here is a pure string
    // transformation over saved assistant data, with no DOM in sight.
    environment: 'node',
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
})
