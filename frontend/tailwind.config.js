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
        // Layered dark surfaces with slight blue undertone
        surface: {
          0: '#0b0b10',
          1: '#111118',
          2: '#191922',
          3: '#22222e',
          4: '#2c2c3a',
        },
        // Borders
        line: {
          DEFAULT: '#1f1f2e',
          subtle: '#161622',
          emphasis: '#2e2e42',
        },
        // Text hierarchy
        txt: {
          1: '#eeeef2',
          2: '#9d9db5',
          3: '#5e5e78',
        },
        // Vibrant accent gradient endpoints
        brand: {
          blue: '#6366f1',
          violet: '#8b5cf6',
          pink: '#ec4899',
          cyan: '#22d3ee',
        },
        // Semantic states — bright and intuitive
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
        'dots': 'radial-gradient(circle, rgba(99,102,241,0.08) 1px, transparent 1px)',
      },
      backgroundSize: {
        'dots': '24px 24px',
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(99,102,241,0.15)',
        'glow': '0 0 30px rgba(99,102,241,0.2)',
        'glow-lg': '0 0 60px rgba(99,102,241,0.25)',
        'glass': '0 8px 32px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
};
