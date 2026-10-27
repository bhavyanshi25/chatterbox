import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// The API + Socket.IO server (see server/). Proxying keeps the frontend and
// API on one origin, so the httpOnly session cookie just works in dev.
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
})
