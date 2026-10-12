import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/tests/**', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@timeline': path.resolve(__dirname, './src/timeline'),
      '@media': path.resolve(__dirname, './src/media'),
      '@composition': path.resolve(__dirname, './src/composition'),
      '@preview': path.resolve(__dirname, './src/preview'),
      '@rendering': path.resolve(__dirname, './src/rendering'),
      '@project': path.resolve(__dirname, './src/project'),
      '@state': path.resolve(__dirname, './src/state'),
      '@ai': path.resolve(__dirname, './src/ai'),
    },
  },
});
