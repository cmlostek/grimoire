import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: '/',
  server: { port: process.env.PORT ? Number(process.env.PORT) : 5173, open: false },
}));
