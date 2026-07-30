import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      maxHeight: {
        '1/2': '50vh',
      },
      boxShadow: {
        'white-box-shadow': `0px 8px 24px 0px rgba(149, 157, 165, 0.20)`,
        'selected-tab-shadow': `0px 0px 8px 0px rgba(0, 0, 0, 0.12)`,
        'screen-container-box-shadow': `0px 7px 29px 0px rgba(100, 100, 111, 0.20)`,
      },
      backgroundImage: {
        'cta-linear-gradient': 'linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, #FFF 86.54%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
