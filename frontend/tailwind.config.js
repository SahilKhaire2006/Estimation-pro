/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2563EB",
        secondary: "#7C3AED",
        accent: "#059669",
        bg: "#F8FAFC",
        card: "#FFFFFF",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        border: "#E2E8F0",
        error: "#DC2626",
        warning: "#D97706"
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        shimmer: "shimmer 1.4s infinite"
      }
    }
  },
  plugins: []
};

