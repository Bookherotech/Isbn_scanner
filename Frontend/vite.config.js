import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // React Compiler auto-memoizes components and hooks (fewer re-renders without manual memo).
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: { host: true },
})
