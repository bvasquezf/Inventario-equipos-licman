import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Registro automático. Si hay una nueva versión, el SW la baja
      // y la activa en el próximo load. No prompt al usuario.
      registerType: 'autoUpdate',
      // Modo dev: habilita el SW en `npm run dev` para poder probarlo.
      // En producción, las options del manifest aplican igual.
      devOptions: {
        enabled: false, // mantener false en dev para no interferir con HMR
      },
      includeAssets: ['favicon.svg', 'icons.svg'],
      // Manifest de la PWA (aparece como "instalable" en Chrome/Safari).
      manifest: {
        name: 'Inventario Licman',
        short_name: 'Inventario',
        description:
          'Levantamiento de inventario de equipos en bodegas (Antillanca, Cordillera, Renca).',
        theme_color: '#0f172a', // slate-900 (matches el header)
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'es-CL',
        // Usamos los SVG existentes como iconos. Chrome/Edge/Firefox
        // aceptan SVG. iOS Safari es picky con PNG, pero el soporte
        // PWA en iOS es limitado de todos modos.
        // Cuando tengas PNGs reales, agregalos en `public/` y reemplazá
        // estas entradas por:
        //   { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        //   { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        icons: [
          {
            src: 'icons.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      // Estrategias de runtime caching para que la app sirva offline.
      // Importante: solo cacheamos GETs del propio origin (assets
      // generados por Vite). Las llamadas a Supabase van por la cola
      // de writes offline, no por Workbox (más determinístico).
      workbox: {
        // Cachear la app shell completa para que abra offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cachear la API de Supabase (lecturas) con NetworkFirst:
        // intenta la red (timeout 3s), fallback a cache. Crítico:
        // NO cachear POST/PATCH/DELETE.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24h
              },
            },
          },
          // Cache de imágenes (iconos del manifest, etc.)
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
            },
          },
        ],
        // No mostrar prompt de update, autoUpdate lo maneja.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})