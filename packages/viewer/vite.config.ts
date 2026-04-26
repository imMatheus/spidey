import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev, vite serves the app on its own port with HMR. The viewer needs a
// few data endpoints that live on the CLI's view-server (`spidey view ...`),
// so proxy those calls back. The CLI's server defaults to port 4321; override
// via SPIDEY_BACKEND when running it on a different port.
const backend = process.env.SPIDEY_BACKEND ?? "http://localhost:4321";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5800,
    proxy: {
      "/spidey-projects.json": backend,
      "/spidey-projects": backend,
      "/spidey.json": backend,
    },
  },
});
