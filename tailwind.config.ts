import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#090a0c",
          900: "#0e1116",
          850: "#151922",
          800: "#1c2230",
        },
        yomi: {
          jade: "#7dd8bd",
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
