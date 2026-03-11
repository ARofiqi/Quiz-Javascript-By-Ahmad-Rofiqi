/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/main.js",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        vscode: {
          bg: '#1e1e1e',
          keyword: '#569cd6',
          string: '#ce9178',
          number: '#b5cea8',
          function: '#dcdcaa',
          operator: '#d4d4d4',
        }
      }
    },
  },
  plugins: [],
}