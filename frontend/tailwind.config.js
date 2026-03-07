import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "src/**/*.{ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#09090b',
          1: '#0f0f12',
          2: '#17171c',
          3: '#1f1f27',
        },
        border: {
          DEFAULT: '#1e1e28',
          subtle: '#16161e',
          emphasis: '#2a2a38',
        },
        text: {
          primary: '#ededf0',
          secondary: '#8b8b9e',
          tertiary: '#55556a',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          muted: 'rgba(99,102,241,0.15)',
          subtle: 'rgba(99,102,241,0.08)',
        },
        state: {
          running: '#34d399',
          'running-muted': 'rgba(52,211,153,0.12)',
          checkpoint: '#fbbf24',
          'checkpoint-muted': 'rgba(251,191,36,0.12)',
          failed: '#fb7185',
          'failed-muted': 'rgba(251,113,133,0.12)',
          recovery: '#fb923c',
          'recovery-muted': 'rgba(251,146,60,0.12)',
          committed: '#38bdf8',
          'committed-muted': 'rgba(56,189,248,0.12)',
          neutral: '#a1a1aa',
          'neutral-muted': 'rgba(161,161,170,0.10)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': 'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '64px 64px',
      },
    },
  },
  plugins: [],
};
