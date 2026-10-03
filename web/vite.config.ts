import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // Manifeste je Farbschema liegen in public/ (npm run icons), theme-init.js verlinkt das passende
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // pdf.js (~1.7 MB) nur bei Bedarf laden: Vorschaubilder für PDFs brauchen ohnehin eine Verbindung
        // App-Icons braucht nur die Installation, nicht der Offline-Betrieb
        globIgnores: ["**/assets/pdf-*.js", "**/assets/pdf.worker*", "**/icons/icon-*", "**/icons/apple-touch-icon-*"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/telegram-login\.html/, /^\/health/],
        runtimeCaching: [
          {
            // SRD-Zauberlisten auch offline verfügbar halten
            urlPattern: ({ url }) => url.pathname.startsWith("/api/srd/"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "srd", expiration: { maxEntries: 4 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3100",
    },
  },
  build: {
    target: "es2022",
  },
});
