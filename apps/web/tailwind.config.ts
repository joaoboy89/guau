import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  "#e8e8f0",
          100: "#c5c5db",
          200: "#9e9ec4",
          300: "#7777ad",
          400: "#59589c",
          500: "#3b3a8b",
          600: "#2e2d7a",
          700: "#222164",
          800: "#1a1a2e",
          900: "#0d0d1a",
        },
        teal: {
          50:  "#e0f7f5",
          100: "#b3ece7",
          200: "#80dfd7",
          300: "#4dd2c7",
          400: "#26c6ba",
          500: "#00baad",
          600: "#00a89c",
          700: "#00907f",
          800: "#007966",
          900: "#005a47",
        },
        brand: {
          bg:             "#1a1a2e",
          surface:        "#22223a",
          border:         "#2e2e4a",
          accent:         "#00a89c",
          "accent-light": "#4dd2c7",
          text:           "#f0f0f8",
          muted:          "#8888aa",
        },
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card:  "0 4px 24px 0 rgba(0,0,0,0.35)",
        float: "0 8px 32px 0 rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
