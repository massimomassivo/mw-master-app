import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// Single source for the version shown in Settings. package.json is kept in
// sync with tauri.conf.json and src-tauri/Cargo.toml on every release.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ["**/src-tauri/**", "**/target/**"] },
  },
  build: {
    target: "es2022",
    minify: true,
    sourcemap: false,
  },
});
