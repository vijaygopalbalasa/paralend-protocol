import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#F8F4EC",
        surface: "#FFFFFF",
        muted: "#F0EBDF",
        border: "#E2DCCC",
        ink: "#0F0E0D",
        ink2: "#3F3D38",
        ink3: "#7A766E",
        ink4: "#B0AC9F",
        coral: {
          DEFAULT: "#FF5436",
          hover: "#E64022",
          deep: "#C23015",
          soft: "#FFE6DF",
        },
        leaf: { DEFAULT: "#0FAF7B", soft: "#DCF5EA", deep: "#0A8159" },
        crimson: { DEFAULT: "#E53056", soft: "#FBDDE3", deep: "#B72343" },
        amber: { DEFAULT: "#F2A800", soft: "#FCEDC2", deep: "#B17B00" },
        // BIG legacy alias block to keep older code rendering after the
        // multiple design-direction rewrites.
        paper: { DEFAULT: "#F8F4EC", pure: "#FFFFFF", dim: "#F0EBDF", line: "#E2DCCC" },
        masthead: { DEFAULT: "#E53056", deep: "#B72343", bright: "#F25671" },
        gold: { DEFAULT: "#F2A800", deep: "#B17B00", bright: "#F5C147" },
        forest: { DEFAULT: "#0FAF7B", deep: "#0A8159", bright: "#3FCC9E" },
        navy: { DEFAULT: "#FF5436", deep: "#C23015", bright: "#FF7A60" },
        base: {
          DEFAULT: "#F8F4EC", 900: "#F8F4EC", 800: "#FFFFFF", 700: "#F0EBDF",
          600: "#E2DCCC", 500: "#B0AC9F", 400: "#7A766E", 300: "#3F3D38",
          200: "#0F0E0D", 100: "#0F0E0D", 50: "#0F0E0D",
        },
        lime: { DEFAULT: "#FF5436", bright: "#FF7A60", deep: "#C23015", glow: "transparent" },
        hot: { DEFAULT: "#E53056", bright: "#F25671", deep: "#B72343", glow: "transparent" },
        mint: { DEFAULT: "#0FAF7B", bright: "#3FCC9E", deep: "#0A8159" },
        signal: { DEFAULT: "#F2A800", bright: "#F5C147", deep: "#B17B00", glow: "transparent" },
        alarm: { DEFAULT: "#E53056", bright: "#F25671", deep: "#B72343", glow: "transparent" },
        brand: { DEFAULT: "#FF5436", hover: "#E64022", soft: "#FFE6DF" },
        win: { DEFAULT: "#0FAF7B", soft: "#DCF5EA" },
        lose: { DEFAULT: "#E53056", soft: "#FBDDE3" },
        warn: { DEFAULT: "#F2A800", soft: "#FCEDC2" },
        paralend: {
          primary: "#FF5436", "primary-hover": "#E64022",
          bg: "#F8F4EC", card: "#FFFFFF", border: "#E2DCCC",
          "text-primary": "#0F0E0D", "text-secondary": "#7A766E",
          green: "#0FAF7B", yellow: "#F2A800", red: "#E53056", orange: "#FF5436",
        },
      },
      fontFamily: {
        sans: [
          "'Manrope'",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        display: ["'Manrope'", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "Menlo", "monospace"],
        serif: ["'Manrope'", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
        "3xl": "12px",
      },
      boxShadow: {
        soft: "none",
        card: "none",
        lift: "none",
        coral: "none",
        "coral-lg": "none",
      },
    },
  },
  plugins: [],
};

export default config;
