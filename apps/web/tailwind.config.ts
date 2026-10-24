import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

// Same tokens as the Fluxyn app, so both feel like one product
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'), surface: v('surface'), sunken: v('sunken'), ink: v('ink'), muted: v('muted'), line: v('line'),
        teal: v('teal'), tealink: v('tealink'), mint: v('mint'), leaf: v('leaf'), sun: v('sun'), sunsoft: v('sunsoft'),
        danger: v('danger'), dangersoft: v('dangersoft'), onteal: v('onteal'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Manrope', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      boxShadow: { lift: '0 1px 2px rgb(var(--ink) / 0.04), 0 8px 24px -12px rgb(var(--ink) / 0.18)' },
    },
  },
  plugins: [],
} satisfies Config;
