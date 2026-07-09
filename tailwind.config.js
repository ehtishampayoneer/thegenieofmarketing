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
        // New system — layered surfaces (Linear/Stripe light-premium)
        canvas: "#F7F8FB",
        surface: "#FFFFFF",
        surface2: "#FAFBFD",
        rail: "#FCFCFE",
        hairline: "#EDEEF3",
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
        // ── Dark premium layer (the new experience) ──
        night: {
          950: "#08060F", // deepest canvas
          900: "#0B0713", // base canvas
          800: "#120C1F", // raised surface
          700: "#1A1230", // panel
          600: "#241738", // hover / border-ish
        },
        aurora: {
          violet: "#7C3AED",
          indigo: "#4F46E5",
          magenta: "#C026D3",
          cyan: "#06B6D4",
        },
        // Text on dark
        moon: {
          100: "#F5F3FF", // primary on dark
          300: "#C4B5FD", // violet-tinted secondary
          400: "#A29BC8", // muted on dark
          500: "#7C7699", // faint on dark
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
        // Dark-layer depth & light
        glass: "0 8px 32px rgba(0,0,0,0.37), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glow-violet": "0 0 40px rgba(124,58,237,0.45)",
        "glow-soft": "0 0 60px rgba(124,58,237,0.25)",
        "card-dark": "0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
