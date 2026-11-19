import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// PWA: emit dist/sw.js stamped with a hash of this build. A deploy that changes the app changes
// sw.js, which is how the installed app learns there is an update (src/pwa/register.js).
function serviceWorker() {
  return {
    name: 'bookhero-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const hash = createHash('sha256')
      for (const name of Object.keys(bundle).sort()) {
        const file = bundle[name]
        hash.update(name)
        if (name.endsWith('.html')) hash.update(String(file.source)) // index.html has no hash in its name
      }
      const source = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8').replaceAll('__BUILD_ID__', hash.digest('hex').slice(0, 12))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // React Compiler auto-memoizes components and hooks (fewer re-renders without manual memo).
    babel({ presets: [reactCompilerPreset()] }),
    serviceWorker(),
  ],
  server: { host: true },
})
