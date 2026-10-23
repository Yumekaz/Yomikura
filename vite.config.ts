import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    // Trace HTML and local inspection outputs must not reload an open reading session.
    watch: {
      ignored: ["**/.cache/**", "**/.pnpm-store/**", "**/.reference-mihon/**", "**/.audit-output/**", "**/test-results/**", "**/playwright-report/**", "**/src-tauri/target/**"],
    },
  },
  optimizeDeps: { entries: ["index.html"] },
});
