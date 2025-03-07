module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f6ff',
          100: '#e0eafc',
          200: '#bed3f9',
          300: '#91b5f3',
          400: '#6090ec',
          500: '#3b70e3',
          600: '#2756d3',
          700: '#2145bc',
          800: '#1f3d98',
          900: '#1e367a',
          950: '#142252',
        },
        secondary: {
          50: '#f5f7fa',
          100: '#ebeef3',
          200: '#d9dfe8',
          300: '#b8c4d3',
          400: '#8fa0b9',
          500: '#6b7fa1',
          600: '#556686',
          700: '#44526d',
          800: '#3a455b',
          900: '#343c4d',
          950: '#23293a',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        dark: '#121212',
        'dark-surface': '#1e1e1e',
        'dark-border': '#333333',
        'dark-text': '#e0e0e0',
        'code-bg': '#1a2233',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'inner-light': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        'glow': '0 0 15px rgba(59, 112, 227, 0.5)',
      },
    },
  },
  plugins: [],
} 