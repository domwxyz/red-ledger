/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'rca-red': '#DB1E1E',
        'soft-charcoal': '#2C2C2C',
        'paper': '#FDFCF8',
        'paper-stack': '#F4F1EA',
        'manila': '#F5F1E8',
        'weathered': '#E5E0D5',
        'leather': '#8B4513'
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
      }
    ]
  }
}
