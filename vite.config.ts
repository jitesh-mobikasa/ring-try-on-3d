import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

// The Shopify CLI sets HOST / SHOPIFY_APP_URL to the tunnel; Vite must accept it and serve HMR through it.
if (process.env.HOST && (!process.env.SHOPIFY_APP_URL || process.env.SHOPIFY_APP_URL === process.env.HOST)) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}
const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;
const hmr = host === "localhost"
  ? { protocol: "ws", host: "localhost", port: 64999, clientPort: 64999 }
  : { protocol: "wss", host, port: Number(process.env.FRONTEND_PORT) || 8002, clientPort: 443 };

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: { preflightContinue: true },
    port: Number(process.env.PORT || 3000),
    hmr,
    fs: { allow: ["app", "node_modules"] },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: { v3_fetcherPersist: true, v3_relativeSplatPath: true, v3_throwAbortReason: true, v3_lazyRouteDiscovery: true },
    }),
  ],
  build: { assetsInlineLimit: 0 },
  optimizeDeps: { include: ["@shopify/app-bridge-react", "@shopify/polaris"] },
});
