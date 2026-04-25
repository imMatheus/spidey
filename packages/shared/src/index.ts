export type Framework = "vite" | "next";

export type SpideyPage = {
  id: string;
  /** Pattern as discovered, e.g. "/users/[id]" */
  route: string;
  /** Concrete URL captured (placeholders substituted), e.g. "/users/1" */
  url: string;
  title?: string;
  status: "ok" | "error";
  error?: string;
  /** innerHTML of <body> */
  html: string;
  /** Concatenated CSS from all stylesheets, inline + external */
  css: string;
  capturedAt: string;
  viewport: { width: number; height: number };
};

export type SpideyDocument = {
  version: 1;
  generatedAt: string;
  project: {
    name: string;
    framework: Framework;
    root: string;
  };
  capture: {
    viewport: { width: number; height: number };
    devServerUrl: string;
  };
  pages: SpideyPage[];
};
