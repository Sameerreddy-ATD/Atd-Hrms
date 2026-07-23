import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const allowedHosts = (
    process.env.VITE_ALLOWED_HOSTS ??
    fileEnv.VITE_ALLOWED_HOSTS ??
    "hrms.sameerreddy.in,localhost,127.0.0.1"
  )
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    resolve: {
      dedupe: ["react", "react-dom"],
      tsconfigPaths: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: {
        ignored: [
          "**/.mysql-data/**",
          "**/.mysql-data-clean/**",
          "**/.mysql-data-clean-broken-*/**",
        ],
      },
    },
    preview: {
      allowedHosts,
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
  };
});
