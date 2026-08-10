/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // App shell & panels
        app: {
          bg: '#09090b', // zinc-950
          surface: '#18181b', // zinc-900
          border: '#27272a', // zinc-800
          hover: '#3f3f46', // zinc-700
        },
        // State-machine graph semantics
        node: {
          atomic: { bg: '#18181b', border: '#3f3f46', text: '#f4f4f5' },
          compound: {
            bg: 'rgba(49, 46, 129, 0.12)',
            border: 'rgba(99, 102, 241, 0.35)',
            header: '#a5b4fc',
          },
          parallel: {
            bg: 'rgba(22, 78, 99, 0.12)',
            border: 'rgba(6, 182, 212, 0.35)',
            header: '#67e8f9',
          },
          final: {
            bg: 'rgba(136, 19, 55, 0.15)',
            border: 'rgba(244, 63, 94, 0.6)',
            accent: '#f43f5e',
          },
          selected: '#3b82f6',
        },
        // Transitions & badges
        edge: {
          stroke: '#52525b',
          selected: '#3b82f6',
          event: '#38bdf8',
          cond: '#fbbf24',
        },
      },
    },
  },
  plugins: [],
};
