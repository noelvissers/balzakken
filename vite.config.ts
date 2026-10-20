import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const pagesBase = repositoryName && !repositoryName.endsWith('.github.io') ? `/${repositoryName}/` : '/'
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS === 'true' ? pagesBase : '/')

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-card.svg'],
      manifest: {
        name: 'BALZAKKEN!',
        short_name: 'BALZAKKEN!',
        description: 'Offline scorekeeping for multiplayer card games.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f6f7f4',
        theme_color: '#176b58',
        icons: [
          { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
})
