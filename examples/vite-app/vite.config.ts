import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import spideyGrab from "spidey-grab/vite";

export default defineConfig({
  plugins: [react(), spideyGrab()],
  server: { port: 5400 },
});
