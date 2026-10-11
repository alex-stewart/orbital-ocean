import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from https://<user>.github.io/orbital-ocean/
  base: '/orbital-ocean/',
  plugins: [react()],
  // Top-level await (used to load the design reader only when needed).
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
