import type { Config } from 'tailwindcss/types/config';

export default {
  theme: {
    extend: {
      colors: {
        planet9: {
          bg: '#f8fafc',
          surface: '#ffffff',
          tertiary: '#f1f5f9',
          border: '#e2e8f0',
          text: '#1e293b',
          muted: '#475569',
          faint: '#94a3b8',
          accent: '#6366f1',
          accentHover: '#4f46e5',
          brand: '#667eea',
          brandTo: '#764ba2',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"Fira Code"', '"JetBrains Mono"', '"SF Mono"', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} as Omit<Config, 'content'>;
