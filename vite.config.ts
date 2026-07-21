import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['@anthropic-ai/claude-agent-sdk'],
            },
          },
        },
      },
      preload: { input: 'electron/preload/index.ts' },
      renderer: {},
    }),
  ],
  build: { outDir: 'dist' },
})
