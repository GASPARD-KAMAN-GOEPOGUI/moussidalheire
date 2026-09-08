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
      workbox: {
        // Le defaut omet les .jpg/.jpeg : sans ca, le logo et l'image du
        // village manquent hors ligne.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webmanifest}'],
        runtimeCaching: [
          {
            // Callback sur le pathname plutot qu'une regex sur le domaine :
            // en production nginx sert le front et proxifie /api/v1 sur la
            // meme origine, alors qu'en dev l'API vit sur le port 5000. Un
            // motif base sur l'origine casserait dans l'un des deux cas.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            // GET seulement : rejouer une reponse POST/PATCH/DELETE depuis le
            // cache ferait croire a une ecriture qui n'a jamais eu lieu.
            method: 'GET',
            options: {
              cacheName: 'api-cache',
              // Reseau degrade (mais pas coupe) : on bascule sur le cache au
              // bout de 3 s au lieu d'attendre le timeout complet du navigateur.
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Feuilles de style Google Fonts (CORS, reponse 200).
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Fichiers de police (reponses opaques, d'ou le statut 0).
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
