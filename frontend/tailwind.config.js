/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {
    colors: { ink: '#14213c', mint: '#2dc796', canvas: '#f6f8fc' },
    fontFamily: { sans: ['DM Sans','sans-serif'], display: ['Plus Jakarta Sans','sans-serif'] }
  } },
  plugins: [],
};
