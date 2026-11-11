import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, run `npm run dev:worker` (port 8787) and `npm run dev` together; /api is proxied.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
