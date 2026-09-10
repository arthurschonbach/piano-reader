import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Piano Reader',
        short_name: 'PianoReader',
        description: 'Lecture de partition avec tempo réglable et générateur infini de notes',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}']
      }
    })
  ]
});
