/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'space-bg': '#1a3a4a',
        'space-dark': '#0d1f2d',
        'space-deeper': '#081520',
        'retro-orange': '#e06030',
        'retro-orange-dark': '#b84820',
        'retro-green': '#40a030',
        'retro-green-dark': '#308020',
        'retro-red': '#c03020',
        'retro-yellow': '#e0b020',
        'retro-white': '#f0f0e0',
        'retro-border': '#f8f8f0',
        'retro-gray': '#808080',
      },
    },
  },
  plugins: [],
};
