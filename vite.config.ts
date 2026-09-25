import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: https://<user>.github.io/ALL-PDF/
export default defineConfig({
  base: '/ALL-PDF/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      manifest: {
        name: 'ALL PDF — редактор и конвертер PDF',
        short_name: 'ALL PDF',
        description: 'Объединяйте, разделяйте, сжимайте, конвертируйте и подписывайте PDF. 100% локально.',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/ALL-PDF/',
        start_url: '/ALL-PDF/#/',
        lang: 'ru',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Тяжелые WASM/ML-модели — только lazy, не прекэшируем
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // OCR: движок, WASM-ядро и языковые модели грузятся с jsdelivr —
        // кэшируем один раз, дальше OCR работает оффлайн
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'tessdata', expiration: { maxEntries: 30, maxAgeSeconds: 90 * 24 * 3600 } }
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract-core', expiration: { maxEntries: 10, maxAgeSeconds: 90 * 24 * 3600 } }
          }
        ]
      }
    })
  ],
  worker: {
    format: 'es'
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-lib': ['pdf-lib'],
          'pdfjs': ['pdfjs-dist'],
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  } as never
});
