import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#08080a",
        foreground: "#f4f4f5",
        surface: {
          50: "#18181f",
          100: "#13131a",
          200: "#0e0e13",
          300: "#09090c",
        },
        card: {
          DEFAULT: "#111116",
          hover: "#171720",
          border: "rgba(255, 255, 255, 0.07)",
        },
        brand: {
          emerald: "#10b981",
          mint: "#34d399",
          cyan: "#06b6d4",
          blue: "#3b82f6",
          indigo: "#6366f1",
          violet: "#8b5cf6",
          amber: "#f59e0b",
          rose: "#f43f5e",
        },
        moh: {
          yellow: "#eab308",
          red: "#ef4444",
          blue: "#3b82f6",
          brown: "#b45309",
          black: "#3f3f46",
          white: "#e4e4e7",
        },
      },
      borderRadius: {
        "3xl": "1.75rem",
        "2xl": "1.25rem",
        xl: "1rem",
        lg: "0.75rem",
        md: "0.5rem",
      },
      boxShadow: {
        glow: "0 0 20px -5px rgba(16, 185, 129, 0.25)",
        "glow-cyan": "0 0 20px -5px rgba(6, 182, 212, 0.25)",
        "glow-purple": "0 0 20px -5px rgba(139, 92, 246, 0.25)",
        card: "0 4px 20px -2px rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
