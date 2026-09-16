import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'sonora-icon.svg'],
    manifest: {
      name: 'Sonora Music',
      short_name: 'Sonora',
      description: 'Search, play, and organize your music.',
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#030303',
      theme_color: '#030303',
      icons: [
        { src: '/sonora-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    },
  })],
})
