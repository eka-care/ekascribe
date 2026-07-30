import type { Config } from 'tailwindcss';
import colors from './src/eka-ui/styles/colors';
import border from './src/eka-ui/styles/border';
import spacing from './src/eka-ui/styles/spacing';

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      ...colors,
    },
    backgroundColor: ({ theme }) => ({
      ...theme('colors'),
      inherit: 'inherit',
    }),
    fill: ({ theme }) => ({ ...theme('colors'), current: 'currentColor' }),
    spacing: { ...spacing },
    fontSize: ({ theme }) => ({ ...theme('spacing') }),
    lineHeight: ({ theme }) => ({ ...theme('spacing') }),
    padding: ({ theme }) => ({ ...theme('spacing') }),
    borderWidth: {
      ...border,
    },
    borderRadius: ({ theme }) => ({ ...theme('borderWidth') }),
    boxShadow: {
      none: 'none',
      '1': '0px 0px 24px 0px rgba(0, 0, 0, 0.16)',
    },
    fontWeight: {
      300: '300',
      400: '400',
      500: '500',
      600: '600',
      700: '700',
      800: '800',
      900: '900',
    },
    opacity: {
      0: '0',
      5: '0.05',
      10: '0.1',
      20: '0.2',
      25: '0.25',
      30: '0.3',
      40: '0.4',
      50: '0.5',
      60: '0.6',
      65: '0.65',
      70: '0.7',
      75: '0.75',
      80: '0.8',
      85: '0.85',
      90: '0.9',
      95: '0.95',
      100: '1',
    },
    outlineWidth: ({ theme }) => ({ ...theme('spacing') }),
    fontFamily: {
      lato: ['Lato', 'sans-serif'],
    },
    maxWidth: ({ theme }) => ({
      none: 'none',
      '3/5': '60%',
      half: '50%',
      full: '100%',
      min: 'min-content',
      max: 'max-content',
      ...theme('spacing'),
    }),
    minWidth: ({ theme }) => ({
      ...theme('spacing'),
      half: '50%',
      full: '100%',
      screen: '100vw',
      min: 'min-content',
      max: 'max-content',
      auto: 'auto',
    }),
    keyframes: {
      spin: {
        to: {
          transform: 'rotate(360deg)',
        },
      },
    },
    animation: {
      spin: 'spin 1s linear infinite',
    },
    extend: {
      maxHeight: {
        '1/2': '50vh',
      },
    },
  },
  plugins: [],
} satisfies Config;
