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
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
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
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'favicon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Тяжелые WASM/ML-модели — только lazy, не прекэшируем
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // OCR-модели Tesseract: скачать один раз, дальше работать оффлайн
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\/.*/i,
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
