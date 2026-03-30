/** @type {import('tailwindcss').Config} */
export default {
  content: ['./**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        claw: {
          bg: '#0f1117',
          surface: '#1a1d27',
          border: '#2a2d3a',
          text: '#e4e4e7',
          muted: '#71717a',
          primary: '#6366f1',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#3b82f6',
          orange: '#f97316',
          purple: '#a855f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
