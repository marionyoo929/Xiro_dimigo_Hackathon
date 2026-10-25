import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: '.',
  server: { host: '0.0.0.0', port: Number(process.env.VITE_PORT || 5173), strictPort: true, proxy: { '/api': process.env.VITE_API_TARGET || 'http://localhost:3001' } },
})
