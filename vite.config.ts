import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Keep the launcher accessible on the original iPhone 14 Pro browser too.
    // Match Block Blast and transform dependency class static blocks for iOS 16.
    target: ['es2020', 'safari16', 'ios16'],
    cssTarget: ['safari16', 'ios16'],
  },
});
