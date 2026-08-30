/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // The theme is carried by [data-theme] on <html>, not by a `dark` class.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Surfaces and ink.
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        sunk: 'var(--sunk)',
        code: 'var(--code)',
        head: 'var(--head)',
        body: 'var(--body)',
        bodyp: 'var(--bodyp)',
        line: 'var(--line)',
        line2: 'var(--line2)',
        plate: 'var(--plate)',
        'on-plate': 'var(--on-plate)',

        // Canonical accents — fills, icons, borders, chart marks.
        green: 'var(--green)',
        blue: 'var(--blue)',
        cyan: 'var(--cyan)',
        yellow: 'var(--yellow)',
        orange: 'var(--orange)',
        red: 'var(--red)',
        violet: 'var(--violet)',
        magenta: 'var(--magenta)',

        // Button fills.
        'fill-blue': 'var(--fill-blue)',
        'fill-blue-h': 'var(--fill-blue-h)',
        'fill-yellow': 'var(--fill-yellow)',
        'fill-yellow-h': 'var(--fill-yellow-h)',
        'on-fill': 'var(--on-fill)',

        // Accent-as-text ramp. Use these whenever an accent carries words.
        cgreen: 'var(--cgreen)',
        cblue: 'var(--cblue)',
        ccyan: 'var(--ccyan)',
        cyellow: 'var(--cyellow)',
        corange: 'var(--corange)',
        cred: 'var(--cred)',
        cviolet: 'var(--cviolet)',
        cmagenta: 'var(--cmagenta)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        // Wordmark, report kicker and large metric numerals only.
        display: ['Chakra Petch', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // Square corners everywhere. Kept as explicit overrides so a stray
        // `rounded-xl` in future work resolves to 0 rather than reintroducing
        // the old shape language.
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
