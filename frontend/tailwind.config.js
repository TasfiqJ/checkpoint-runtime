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
        // Theme-adaptive surfaces (CSS variables — light/dark)
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
          4: 'rgb(var(--surface-4) / <alpha-value>)',
        },
        // Theme-adaptive borders
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          subtle: 'rgb(var(--line-subtle) / <alpha-value>)',
          emphasis: 'rgb(var(--line-emphasis) / <alpha-value>)',
        },
        // Theme-adaptive text
        txt: {
          1: 'rgb(var(--txt-1) / <alpha-value>)',
          2: 'rgb(var(--txt-2) / <alpha-value>)',
          3: 'rgb(var(--txt-3) / <alpha-value>)',
        },
        // Vibrant accent gradient endpoints (static — same in both modes)
        brand: {
          blue: '#6366f1',
          violet: '#8b5cf6',
          pink: '#ec4899',
          cyan: '#22d3ee',
        },
        // Semantic states (static)
        ok: { DEFAULT: '#10b981', muted: 'rgba(16,185,129,0.12)', soft: 'rgba(16,185,129,0.25)' },
        warn: { DEFAULT: '#f59e0b', muted: 'rgba(245,158,11,0.12)', soft: 'rgba(245,158,11,0.25)' },
        err: { DEFAULT: '#ef4444', muted: 'rgba(239,68,68,0.12)', soft: 'rgba(239,68,68,0.25)' },
        info: { DEFAULT: '#3b82f6', muted: 'rgba(59,130,246,0.12)', soft: 'rgba(59,130,246,0.25)' },
        recover: { DEFAULT: '#f97316', muted: 'rgba(249,115,22,0.12)' },
        muted: { DEFAULT: '#71717a', bg: 'rgba(113,113,122,0.10)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'gradient': 'gradient 8s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      boxShadow: {
        'glow-sm': 'var(--shadow-glow-sm)',
        'glow': 'var(--shadow-glow)',
        'glow-lg': 'var(--shadow-glow-lg)',
        'glass': 'var(--shadow-glass)',
      },
    },
  },
  plugins: [],
};
