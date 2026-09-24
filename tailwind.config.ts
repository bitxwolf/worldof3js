import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mac: {
          bg: '#16181d',
          surface: 'rgba(28, 31, 38, 0.72)',
          surfaceBorder: 'rgba(255, 255, 255, 0.08)',
          sidebar: 'rgba(21, 23, 29, 0.78)',
          panel: 'rgba(25, 28, 35, 0.65)',
          accent: '#3b82f6',
          accentHover: '#2563eb',
          text: '#f3f4f6',
          textMuted: '#9ca3af',
          card: 'rgba(38, 42, 53, 0.55)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
