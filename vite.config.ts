import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    tsconfigPaths: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/.mysql-data/**", "**/.mysql-data-clean/**", "**/.mysql-data-clean-broken-*/**"],
    },
  },
  preview: {
    allowedHosts: ["hrms.sameerreddy.in"],
  },
  plugins: [
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    tailwindcss(),
    react(),
  ],
});
