/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: '#f4ead5',
        ink: '#1a1614',
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
