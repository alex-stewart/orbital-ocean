import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { atlasEditor } from './scripts/editor-plugin';

export default defineConfig({
  // Served from https://<user>.github.io/orbital-ocean/
  base: '/orbital-ocean/',
  // The editor's server (npm run dev only): see scripts/editor-plugin.ts.
  plugins: [react(), atlasEditor()],
  // Top-level await (used to load the design reader only when needed).
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
