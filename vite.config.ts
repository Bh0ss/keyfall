import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/keyfall/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
