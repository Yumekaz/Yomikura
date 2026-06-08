import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "var(--ink-950)",
          900: "var(--ink-900)",
          850: "var(--ink-850)",
          800: "var(--ink-800)",
        },
        yomi: {
          jade: "rgb(var(--yomi-accent) / <alpha-value>)",
          mint: "#a9f2d4",
          gold: "#f2c879",
          plum: "#b69bff",
          coral: "#ef8a7a",
        },
      },
      boxShadow: {
        panel: "0 18px 60px rgba(0, 0, 0, 0.34)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
