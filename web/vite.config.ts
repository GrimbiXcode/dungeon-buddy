import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Dungeon Buddy",
        short_name: "Dungeon Buddy",
        description: "Deine D&D-5e-Toolbox: Tagebuch, NPC-Netzwerk, Charakterbogen und Zauberbuch.",
        lang: "de",
        theme_color: "#1a1625",
        background_color: "#1a1625",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // pdf.js (~1.7 MB) nur bei Bedarf laden: Vorschaubilder für PDFs brauchen ohnehin eine Verbindung
        globIgnores: ["**/assets/pdf-*.js", "**/assets/pdf.worker*"],
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
