/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#1a1a1a",
        panel: {
          DEFAULT: "#232323",
          2: "#2c2c2c",
        },
        edge: "#383838",
        fg: {
          DEFAULT: "#e8e8e8",
          dim: "#9a9a9a",
          faint: "#6a6a6a",
        },
        accent: {
          DEFAULT: "#5b8cff",
          soft: "rgba(91, 140, 255, 0.18)",
        },
        danger: "#ff6464",
        ok: "#3ec27b",
        warn: "#ff5d8a",
        amberish: "#f0a000",
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
