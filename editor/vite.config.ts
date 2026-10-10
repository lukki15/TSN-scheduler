import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wasm()],
  base: '/TSN-scheduler/',
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // pixi is large and changes rarely; keep it out of the app chunk
        manualChunks: { pixi: ['pixi.js', '@pixi/react'] },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
