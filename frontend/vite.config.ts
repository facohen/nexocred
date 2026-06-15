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
      // prompt (no autoUpdate): NUNCA recargar la app mientras un cobrador está
      // cargando un cobro en la calle. El usuario decide cuándo actualizar; el
      // estado seguro vive en IndexedDB de todos modos.
      registerType: "prompt",
      manifest: {
        name: "NexoCred",
        short_name: "NexoCred",
        description: "Originación, cobranza y Ruta de Cobranza",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Las navegaciones a la API nunca deben devolver el shell SPA.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Cache the assigned route + its stops so Ruta de Cobranza loads offline.
            urlPattern: ({ url }) => /\/api\/v1\/rutas(\/[^/]+)?(\/paradas)?$/.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "ruta-asignada",
              networkTimeoutSeconds: 4,
              // 48h: la jornada de campo puede pasar las 24h previas.
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 48 },
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
  build: {
    rollupOptions: {
      output: {
        // Solo vendors estables (mejor cacheo entre deploys). El splitting por
        // feature lo hace el lazy-loading del router, no manualChunks.
        // Vite 8 / Rollup 4: manualChunks como función (la forma objeto ya no
        // se acepta en este overload de OutputOptions).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || /node_modules\/react\//.test(id)) return "react-vendor";
          if (id.includes("@tanstack/react-router")) return "router";
          if (id.includes("@tanstack/react-query")) return "query";
          if (id.includes("@tanstack/react-table")) return "table";
          if (id.includes("@tremor/react")) return "charts";
          if (id.includes("react-hook-form") || id.includes("/zod/")) return "forms";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
});
