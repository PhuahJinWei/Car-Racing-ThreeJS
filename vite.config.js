import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build can be hosted from any sub-folder (GitHub Pages, itch.io, etc.)
  base: './',
  server: {
    // Expose on the LAN so the game can be tested on a phone on the same Wi-Fi.
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
