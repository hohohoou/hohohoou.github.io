import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { omitDevelopmentModels } from "./scripts/release-assets.mjs";
import { thirdPartyNotices } from "./scripts/third-party-notices.mjs";

export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  plugins: [react(), tailwindcss(), omitDevelopmentModels(), thirdPartyNotices()],
});
