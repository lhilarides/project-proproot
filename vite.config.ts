import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024 // 50MB to support DuckDB Wasm
      },
      manifest: {
        name: 'Global Mangrove Watch',
        short_name: 'GMW',
        description: 'Global Mangrove Watch MVP with Offline Capabilities',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'https://vitejs.dev/logo.svg', // generic placeholder
            sizes: '192x192',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ]
})
