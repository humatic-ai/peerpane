import baseConfig from '@extension/tailwindcss-config';
import type { Config } from 'tailwindcss/types/config';

export default {
  ...baseConfig,
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...(baseConfig.theme?.extend ?? {}),
      keyframes: {
        ...(baseConfig.theme?.extend as { keyframes?: Record<string, unknown> } | undefined)?.keyframes,
        progress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        ...(baseConfig.theme?.extend as { animation?: Record<string, unknown> } | undefined)?.animation,
        progress: 'progress 1.5s infinite ease-in-out',
      },
    },
  },
} as Config;
