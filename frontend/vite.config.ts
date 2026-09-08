import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker ecrit a la main (src/sw.ts) plutot que genere : c'est le
      // prerequis pour y ajouter les listeners push, que generateSW ne permet
      // pas. Le fichier reproduit a l'identique ce que generateSW produisait.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.jpg'],
      manifest: {
        name: 'Moussidalheire',
        short_name: 'Moussidalheire',
        description:
          'Moussidalheire la mémoire vivante du village. Recensement, généalogie et actualités des habitants.',
        lang: 'fr',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#8a4a2f',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // En mode injectManifest, la cle `workbox` n'est plus lue : seul le
      // calcul du precache reste ici, les strategies de cache sont desormais
      // ecrites dans src/sw.ts.
      injectManifest: {
        // Le defaut omet les .jpg/.jpeg : sans ca, le logo et l'image du
        // village manquent hors ligne.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webmanifest}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
