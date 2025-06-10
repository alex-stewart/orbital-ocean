import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/orbital-ocean/',
  plugins: [preact(), tailwindcss()],
  build: {
    outDir: 'dist',
  },
});
