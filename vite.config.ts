import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/.mysql-data/**", "**/.mysql-data-clean/**", "**/.mysql-data-clean-broken-*/**"],
    },
  },
  plugins: [
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    tsconfigPaths(),
    tailwindcss(),
    react(),
  ],
});
