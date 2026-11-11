import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En desarrollo, /api se reenvía a la API local; en producción lo hace Nginx.
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    target: 'es2022',
    // Sin recursos incrustados como data: URI. La política CSP del proxy
    // (font-src 'self') bloquearía las fuentes en línea.
    assetsInlineLimit: 0,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
