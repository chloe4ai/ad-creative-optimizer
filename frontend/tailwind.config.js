/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        platform: {
          google: '#4285F4',
          meta: '#0668E1',
          tiktok: '#000000',
          pinterest: '#E60023',
          linkedin: '#0A66C2',
        },
        status: {
          healthy: '#22C55E',
          warning: '#F59E0B',
          fatigued: '#EF4444',
        },
      },
    },
  },
  plugins: [],
}
