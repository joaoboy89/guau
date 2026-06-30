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
        brand: {
          bg:             "#FAF5EE",
          surface:        "#FFFFFF",
          "surface-sand": "#F7F0E5",
          border:         "#E8DDD0",
          text:           "#1E1B16",
          "text-body":    "#3D3628",
          "text-muted":   "#8B7355",
          primary:        "#C25C2A",
          "primary-soft": "#FFF0E8",
          green:          "#2D5A3D",
          "green-soft":   "#EBF3EE",
          sand:           "#D4A96A",
        },
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        sans:  ["var(--font-dm-sans)",  "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card:  "0 2px 12px 0 rgba(30,27,22,0.08)",
        float: "0 4px 24px 0 rgba(30,27,22,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
