import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    // PWA shell for La Ruta: Workbox precaches the app shell and runtime-caches
    // the assigned-route GETs so a cobrador can open the route offline. The
    // offline write path is the IndexedDB queue (features/ruta/queue.ts), and
    // Background Sync (sw-sync.ts) replays it via the tested sincronizarRuta.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "NexoCred",
        short_name: "NexoCred",
        description: "Originación, cobranza y La Ruta",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Cache the assigned route + its stops so La Ruta loads offline.
            urlPattern: ({ url }) => /\/api\/v1\/rutas(\/[^/]+)?(\/paradas)?$/.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "ruta-asignada",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
