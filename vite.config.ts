import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
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
}));
