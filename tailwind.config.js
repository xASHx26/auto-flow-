/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'kat-bg': '#1A1A1A',
        'kat-panel': '#2A2A2A',
        'kat-border': '#3A3A3A',
        'kat-accent': '#58a6ff',
        'kat-text': '#E1E1E1',
        'kat-muted': '#A0A0A0',
      }
    },
  },
  plugins: [],
}
