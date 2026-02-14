/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'rca-red': 'rgb(var(--color-rca-red) / <alpha-value>)',
        'soft-charcoal': 'rgb(var(--color-soft-charcoal) / <alpha-value>)',
        'paper': 'rgb(var(--color-paper) / <alpha-value>)',
        'paper-stack': 'rgb(var(--color-paper-stack) / <alpha-value>)',
        'manila': 'rgb(var(--color-manila) / <alpha-value>)',
        'weathered': 'rgb(var(--color-weathered) / <alpha-value>)',
        'leather': 'rgb(var(--color-leather) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
        title: ['Built Titling', 'Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        'btn': '0.5rem',
        'card': '0.75rem'
      },
      transitionDuration: {
        DEFAULT: '200ms'
      }
    }
  },
  plugins: [
    require('daisyui'),
    require('@tailwindcss/typography')
  ],
  daisyui: {
    themes: [
      {
        'red-ledger': {
          'primary': '#DB1E1E',
          'primary-content': '#FFFFFF',
          'secondary': '#2C2C2C',
          'secondary-content': '#FDFCF8',
          'accent': '#8B4513',
          'accent-content': '#FDFCF8',
          'neutral': '#F5F1E8',
          'neutral-content': '#2C2C2C',
          'base-100': '#FDFCF8',
          'base-200': '#F4F1EA',
          'base-300': '#E5E0D5',
          'base-content': '#2C2C2C',
          'info': '#5D737E',
          'info-content': '#FDFCF8',
          'success': '#4A5D4A',
          'success-content': '#FDFCF8',
          'warning': '#B85C38',
          'warning-content': '#FDFCF8',
          'error': '#A92525',
          'error-content': '#FDFCF8',
          '--rounded-btn': '0.5rem',
          '--rounded-box': '0.75rem',
          '--animation-btn': '200ms',
          '--animation-input': '200ms',
          '--btn-focus-scale': '0.98'
        }
      },
      {
        'red-ledger-dark': {
          'primary': '#E24848',
          'primary-content': '#FFF4F4',
          'secondary': '#D8CAC0',
          'secondary-content': '#1F1A19',
          'accent': '#B77E4F',
          'accent-content': '#FFF6ED',
          'neutral': '#2A2321',
          'neutral-content': '#F2E5DB',
          'base-100': '#1F1A19',
          'base-200': '#272120',
          'base-300': '#352E2C',
          'base-content': '#F1E7DE',
          'info': '#7AA6B9',
          'info-content': '#111111',
          'success': '#78A489',
          'success-content': '#111111',
          'warning': '#D39A63',
          'warning-content': '#1C140F',
          'error': '#EC7272',
          'error-content': '#160B0B',
          '--rounded-btn': '0.5rem',
          '--rounded-box': '0.75rem',
          '--animation-btn': '200ms',
          '--animation-input': '200ms',
          '--btn-focus-scale': '0.98'
        }
      }
    ]
  }
}
