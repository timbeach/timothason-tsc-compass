import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", timeout: 120000, workers: 1, // each test loads the in-browser model; parallel runs starve the CPU
  webServer: { command: "npm run build && npx vite preview web --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 180000 },
  use: { baseURL: "http://localhost:4173" },
});
