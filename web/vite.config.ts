import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Same origin as in production (nginx): the session cookie works and there is no CORS.
  // API_URL (env or .env file) points the dev proxy at another backend.
  server: { proxy: { "/api": loadEnv(mode, ".", "").API_URL || "http://localhost:8000" } },
}));
