import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

// Path the app expects to be served from. Default to relative ('./') so the
// built bundle works from file://, any subpath, GitHub Pages, or a root
// domain without changes. For a custom subpath (e.g. /resume-editor/),
// pass APP_BASE at build time.
const base = process.env.APP_BASE ?? './';

// SINGLE_FILE=1 collapses the whole app into one self-contained index.html that
// runs from file:// with no extra files. Disables the PWA service worker
// because SWs cannot register from a file:// origin.
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  base,
  plugins: [
    react(),
    !singleFile &&
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Resume Editor',
        short_name: 'Resume Editor',
        description: 'Local-first BYOK resume editor with live preview, AI tailoring, and offline support.',
        theme_color: '#0a0a0a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2,ttf}'],
        globIgnores: [
          '**/react-pdf.browser-*.js',
          '**/pdfWorker-*.js',
          '**/pdf-*.js',
          '**/mammoth.browser-*.js',
          '**/RichBulletEditor-*.js',
          '**/dist-*.js',
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
    singleFile && viteSingleFile({ removeViteModuleLoader: true }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    chunkSizeWarningLimit: 1600,
    // In single-file mode, force everything inline by killing chunk splitting,
    // CSS code-splitting, and asset inlining limits.
    ...(singleFile
      ? {
          cssCodeSplit: false,
          assetsInlineLimit: 100_000_000,
          outDir: 'dist-single',
          rollupOptions: {
            output: {
              manualChunks: undefined,
              inlineDynamicImports: true,
            },
          },
        }
      : {}),
  },
});
