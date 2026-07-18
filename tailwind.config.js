/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Colour is owned by the mg "Aperture / Dawn" token layer in globals.css
      // (CSS variables, consumed via mg-* classes and inline var()). We expose a
      // small, on-brand convenience palette here that mirrors those tokens — no
      // legacy "AI purple" families, one system only.
      colors: {
        ink: {
          DEFAULT: "#11202E", 900: "#0B141C", 800: "#11202E", 700: "#1C2E3D",
          600: "#33475A", 500: "#5A6B7B", 400: "#8A98A5", 300: "#B7C1C9",
          200: "#D8DEE3", 100: "#E9EDF0", 50: "#F2F4F5",
        },
        dawn: { 100: "#FFF1DD", 300: "#FFD79E", 500: "#FBB360", 600: "#F59E3D", 700: "#D97F1E", glow: "#FFC876" },
        accent: { DEFAULT: "#1E9E6A", soft: "#E4F3EC", ink: "#0F6B45" },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
