import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `--mode single` builds one self-contained HTML file (preview link for the PO).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
  build: mode === "single" ? { outDir: "dist-single" } : {},
  // Same origin as in production (nginx): the session cookie works and there is no CORS.
  // API_URL (env or .env file) points the dev proxy at another backend.
  server: { proxy: { "/api": loadEnv(mode, ".", "").API_URL || "http://localhost:8000" } },
}));
