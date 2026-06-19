import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 60000,
    include: ['tests/integration/security/**/*.test.ts'],
    testTimeout: 60000
  }
})
