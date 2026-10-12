/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ReelForge Design System
        forge: {
          bg: {
            primary:   '#0D0F14',   // Darkest — main app background
            secondary: '#13161E',   // Panel backgrounds
            tertiary:  '#1A1E2A',   // Card/section backgrounds
            elevated:  '#21273A',   // Elevated panels
            overlay:   '#2A3048',   // Hover/selection states
          },
          accent: {
            violet:     '#7C3AED',  // Primary brand violet
            blue:       '#3B82F6',  // Action blue
            teal:       '#06B6D4',  // Highlight teal
            'violet-glow': '#9D5FF8',
            'teal-glow':   '#22D3EE',
          },
          text: {
            primary:   '#F1F5F9',
            secondary: '#94A3B8',
            muted:     '#64748B',
            disabled:  '#334155',
          },
          border: {
            subtle:  '#1E2436',
            default: '#2D3550',
            active:  '#7C3AED',
          },
          status: {
            success: '#22C55E',
            warning: '#F59E0B',
            error:   '#EF4444',
            info:    '#06B6D4',
          },
          timeline: {
            video:  '#3B82F6',   // Video track color
            audio:  '#22C55E',   // Audio track color
            text:   '#F59E0B',   // Text track color
            image:  '#EC4899',   // Image track color
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-from-left': 'slideInFromLeft 0.2s ease-out',
        'slide-in-from-right': 'slideInFromRight 0.2s ease-out',
        'slide-in-from-bottom': 'slideInFromBottom 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124, 58, 237, 0)' },
          '50%': { boxShadow: '0 0 12px 4px rgba(124, 58, 237, 0.4)' },
        },
        slideInFromLeft: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideInFromRight: {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideInFromBottom: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'forge-gradient': 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
        'forge-gradient-subtle': 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(6,182,212,0.15) 100%)',
      },
      boxShadow: {
        'forge-sm':  '0 0 8px rgba(124, 58, 237, 0.2)',
        'forge-md':  '0 0 16px rgba(124, 58, 237, 0.3)',
        'forge-lg':  '0 0 32px rgba(124, 58, 237, 0.4)',
        'teal-sm':   '0 0 8px rgba(6, 182, 212, 0.2)',
        'elevation': '0 4px 24px rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
};
