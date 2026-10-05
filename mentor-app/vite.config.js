import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The app is served by the service at /mentor (see service/src/server.ts), so assets live under /mentor/.
// In development, /api is proxied to a locally running service (default port 8092).
export default defineConfig({
  base: "/mentor/",
  plugins: [vue()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5180,
    proxy: { "/api": { target: process.env.MENTOR_API ?? "http://localhost:8092", changeOrigin: true } },
  },
});
