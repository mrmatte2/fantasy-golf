/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'DM Mono'", "monospace"],
      },
      colors: {
        masters: {
          green: "#1a4731",
          gold: "#c9a84c",
          cream: "#f5f0e8",
          dark: "#0d2318",
          light: "#2d6648",
          accent: "#e8d5a3",
        },
      },
    },
  },
  plugins: [],
};
