import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import spideySense from "spidey-sense/vite";

export default defineConfig({
  plugins: [react(), spideySense()],
  server: { port: 5400 },
});
