/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Existing tokens (kept for backward-compat with current components)
        genie: {
          purple: "#6B21A8",
          emerald: "#059669",
          amber: "#F59E0B",
          ink: "#111827",
          mist: "#FAFAFA",
        },
        // New system — layered surfaces
        canvas: "#F6F6FB",
        surface: "#FFFFFF",
        surface2: "#FBFBFE",
        rail: "#FCFCFE",
        ink: {
          900: "#0F1222",
          600: "#4A4E63",
          400: "#6B7280",
          200: "#D9DBE6",
        },
        brand: {
          purple: "#6B21A8",
          violet: "#7C3AED",
          indigo: "#4F46E5",
          emerald: "#059669",
        },
        // Category tokens — consistent everywhere
        cat: {
          seo: "#2563EB",
          trust: "#059669",
          tech: "#7C3AED",
          social: "#DB2777",
          speed: "#F59E0B",
          content: "#4F46E5",
        },
        prio: {
          high: "#EF4444",
          quick: "#059669",
          strategic: "#4F46E5",
          low: "#8A8FA3",
        },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        xs: "0 1px 2px rgba(16,18,34,0.04)",
        sm: "0 1px 3px rgba(16,18,34,0.06), 0 1px 2px rgba(16,18,34,0.04)",
        md: "0 4px 12px rgba(16,18,34,0.06), 0 2px 4px rgba(16,18,34,0.04)",
        lg: "0 12px 32px rgba(79,70,229,0.10), 0 4px 8px rgba(16,18,34,0.04)",
        glow: "0 0 0 1px rgba(124,58,237,0.15), 0 8px 24px rgba(124,58,237,0.12)",
      },
    },
  },
  plugins: [],
};
