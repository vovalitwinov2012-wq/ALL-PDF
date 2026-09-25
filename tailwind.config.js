/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca'
        }
      },
      borderRadius: {
        xl2: '1rem'
      },
      boxShadow: {
        soft: '0 8px 30px rgba(79, 70, 229, 0.12)'
      }
    }
  },
  plugins: []
};
