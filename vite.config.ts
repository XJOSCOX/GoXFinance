import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: { port: 1420, strictPort: true },
  plugins: [react(), tailwindcss()],
  base: './',
  test: { environment: 'node' },
})
