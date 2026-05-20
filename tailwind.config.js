/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // App-chrome tokens. Dark variants are applied with `dark:` prefix
        // OR via the rgb()-with-CSS-variables trick below. We use the latter
        // so the bulk of the codebase doesn't need to sprinkle dark: prefixes
        // on every color.
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          soft: 'rgb(var(--c-ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--c-ink-subtle) / <alpha-value>)',
        },
        paper: {
          DEFAULT: 'rgb(var(--c-paper) / <alpha-value>)',
          tint: 'rgb(var(--c-paper-tint) / <alpha-value>)',
          edge: 'rgb(var(--c-paper-edge) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
        },
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"EB Garamond"', 'Garamond', 'Georgia', 'serif'],
      },
      boxShadow: {
        page: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
