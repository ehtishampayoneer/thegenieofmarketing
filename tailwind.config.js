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
        // ── NEW SYSTEM: ink + paper + one whisper of accent ──
        paper: "#F8F8F6",       // off-white canvas
        panel: "#FFFFFF",        // cards
        ink: {
          DEFAULT: "#11202E",   // near-black — primary
          900: "#11202E",
          800: "#1B2A38",
          700: "#2C3A47",
          600: "#4A5561",
          500: "#697682",
          400: "#8A949E",
          300: "#B4BCC3",
          200: "#D6DBDF",
          100: "#E9ECEE",
          50: "#F2F4F4",
        },
        accent: {
          DEFAULT: "#1E9E6A",   // muted emerald — ONLY for live/winning/done
          soft: "#E6F4EE",
          ink: "#127350",
        },
        // ── V2 "APERTURE / DAWN" — the light Genie casts / the morning reveal.
        // Marketing Genie's signature. Used for the Aperture + key highlights,
        // never as page-wide chrome. NOT an "AI purple" gradient.
        dawn: {
          100: "#FFF1DD",
          300: "#FFD79E",
          500: "#FBB360",
          600: "#F59E3D",
          700: "#D97F1E",
          glow: "#FFC876",
        },
        // legacy surfaces kept as aliases so old screens don't break mid-migration
        canvas: "#F8F8F6",
        surface: "#FFFFFF",
        surface2: "#FAFBFB",
        rail: "#FFFFFF",
        hairline: "#E9ECEE",
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
        // V2 depth scale
        "lift": "0 2px 8px rgba(13,26,36,0.06), 0 1px 2px rgba(13,26,36,0.04)",
        "lift-lg": "0 12px 32px rgba(13,26,36,0.10), 0 3px 8px rgba(13,26,36,0.05)",
        "dawn": "0 8px 40px rgba(245,158,61,0.18)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
