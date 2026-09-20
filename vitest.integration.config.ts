import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@contracts': path.resolve(__dirname, './supabase/functions/_shared/contracts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    include: ['tests/integration/**/*.{test,spec}.ts'],
    fileParallelism: false,
  },
})
