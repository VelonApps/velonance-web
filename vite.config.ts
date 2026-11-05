import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('/node_modules/') && (id.includes('/@firebase/') || id.includes('/firebase/'))
            ? 'firebase'
            : id.includes('/node_modules/recharts/')
              ? 'charts'
              : undefined,
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], restoreMocks: true },
})
