import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="spidey-viewer-theme">
      <App />
      <Toaster position="bottom-right" richColors closeButton />
    </ThemeProvider>
  </React.StrictMode>,
);
