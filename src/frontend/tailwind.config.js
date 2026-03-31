/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'ct-bg-primary': '#0F172A',
        'ct-bg-secondary': '#1E293B',
        'ct-bg-tertiary': '#334155',
        'ct-text-primary': '#F1F5F9',
        'ct-text-secondary': '#94A3B8',
        'ct-idle': '#9CA3AF',
        'ct-running': '#3B82F6',
        'ct-success': '#10B981',
        'ct-failed': '#EF4444',
        'ct-waiting': '#F59E0B',
        'ct-changed': '#8B5CF6',
      },
      animation: {
        'slow-blink': 'slowBlink 2s infinite',
        'pulse-3': 'pulse3 0.6s ease-in-out 3',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-highlight': 'fadeHighlight 1s ease-out',
      },
      keyframes: {
        slowBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        pulse3: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(139, 92, 246, 0.7)' },
          '50%': { boxShadow: '0 0 0 8px rgba(139, 92, 246, 0)' },
        },
        slideIn: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeHighlight: {
          '0%': { backgroundColor: 'rgba(59, 130, 246, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
};
